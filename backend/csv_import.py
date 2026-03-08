import csv
import io
from typing import Optional, Tuple

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import Player, PlayerRole
from schemas import PlayerCreate


# ─────────────────────────────────────────────
# Expected CSV columns
# The uploaded file must have exactly these
# headers (case-insensitive, whitespace stripped)
# ─────────────────────────────────────────────
EXPECTED_COLUMNS = {"name", "team", "role"}

# Valid role values — case-insensitive on input,
# always normalized to uppercase before saving
VALID_ROLES = {role.value for role in PlayerRole}  # {"P", "D", "C", "A"}


# ─────────────────────────────────────────────
# HELPER: Get existing player keys
#
# Fetches all players already in the auction
# and returns a set of "name|team" strings.
# Used to detect duplicates during import.
#
# Example return value:
#   {"donnarumma|psg", "barella|inter", ...}
# ─────────────────────────────────────────────
async def get_existing_player_keys(
    db: AsyncSession,
    auction_id: str
) -> set:
    """
    Query the database for all players already loaded
    into this auction. Returns a set of lowercase
    "name|team" strings for fast duplicate checking.

    Args:
        db:         The async database session
        auction_id: The auction to check against

    Returns:
        A set of strings like {"donnarumma|psg", "barella|inter"}
    """
    result = await db.execute(
        select(Player.name, Player.team).where(
            Player.auction_id == auction_id
        )
    )
    rows = result.all()

    # Normalize to lowercase so "Barella" and "barella" are treated as the same
    return {f"{name.strip().lower()}|{team.strip().lower()}" for name, team in rows}


# ─────────────────────────────────────────────
# HELPER: Validate a single CSV row
#
# Returns either a valid PlayerCreate object
# or an error message string — never both.
# ─────────────────────────────────────────────
def validate_csv_row(
    row: dict,
    row_number: int
) -> Tuple[Optional[PlayerCreate], Optional[str]]:

    name = row.get("Name", "").strip()
    team = row.get("Team", "").strip()
    role_raw = row.get("Role", "").strip().upper()
    value_raw = row.get("Value", "").strip()  # ← NEW

    if not name:
        return None, f"Row {row_number}: 'Name' cannot be empty."
    if not team:
        return None, f"Row {row_number}: 'Team' cannot be empty for player '{name}'."
    if not role_raw:
        return None, f"Row {row_number}: 'Role' cannot be empty for player '{name}'."
    if role_raw not in VALID_ROLES:
        return None, (
            f"Row {row_number}: Invalid role '{role_raw}' for player '{name}'. "
            f"Must be one of: {', '.join(sorted(VALID_ROLES))}."
        )

    # ── Parse Value — optional, defaults to 0 ──  ← NEW
    value = 0
    if value_raw:
        try:
            value = int(value_raw)
            if value < 0:
                return None, f"Row {row_number}: Value must be a non-negative integer for player '{name}'."
        except ValueError:
            return None, f"Row {row_number}: Value '{value_raw}' is not a valid integer for player '{name}'."

    player_data = PlayerCreate(
        name=name,
        team=team,
        role=PlayerRole(role_raw),
        value=value  # ← NEW
    )
    return player_data, None


# ─────────────────────────────────────────────
# MAIN FUNCTION: Import players from CSV
#
# This is the entry point called by the route
# handler when the admin uploads a CSV file.
#
# Flow:
# 1. Read the uploaded file content
# 2. Detect and validate headers
# 3. Validate each row, collecting errors
# 4. Check for duplicates against the DB
# 5. Bulk insert all valid, non-duplicate players
# 6. Return a summary dict
# ─────────────────────────────────────────────
async def import_players_from_csv(
    file: UploadFile,
    auction_id: str,
    db: AsyncSession
) -> dict:
    """
    Parse, validate, and import players from an uploaded CSV file.

    
    Expected CSV format (Value column is optional):
        Name,Team,Role,Value
        Donnarumma,PSG,P,45
        Bastoni,Inter,D,22
        Barella,Inter,C,38
        Lautaro,Inter,A,52

    Args:
        file:       The uploaded CSV file (FastAPI UploadFile)
        auction_id: The auction to import players into
        db:         The async database session

    Returns:
        A summary dict:
        {
            "total_rows":         int,   # Total data rows read (excluding header)
            "imported":           int,   # Successfully imported players
            "skipped_duplicates": int,   # Players already in the auction (skipped)
            "errors": [                  # List of row-level validation errors
                {"row": int, "message": str},
                ...
            ]
        }

    Raises:
        ValueError: If the file is empty or has wrong/missing headers
    """

    # ── Step 1: Read the uploaded file content ─
    # UploadFile.read() is async — we await it to
    # get the raw bytes, then decode to a string.
    raw_bytes = await file.read()

    if not raw_bytes:
        raise ValueError("The uploaded file is empty.")

    try:
        content = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        # Try latin-1 as a fallback — some Excel CSV exports use it
        try:
            content = raw_bytes.decode("latin-1")
        except UnicodeDecodeError:
            raise ValueError(
                "Could not read the file. Please save your CSV as UTF-8 encoding."
            )

    # ── Step 2: Parse with csv.DictReader ─────
    # DictReader uses the first row as column headers.
    # Each subsequent row becomes a dict like:
    # {"Name": "Barella", "Team": "Inter", "Role": "C"}
    reader = csv.DictReader(io.StringIO(content))

    # Validate that headers exist and are correct
    if reader.fieldnames is None:
        raise ValueError("The CSV file appears to be empty or has no headers.")

    # Normalize headers: strip whitespace and capitalize first letter
    normalized_headers = {h.strip().capitalize() for h in reader.fieldnames if h}

    missing_columns = {"Name", "Team", "Role"} - normalized_headers
    if missing_columns:
        raise ValueError(
            f"Missing required columns: {', '.join(sorted(missing_columns))}. "
            f"Found columns: {', '.join(reader.fieldnames)}. "
            f"Expected: Name, Team, Role"
        )

    # ── Step 3: Fetch existing players ────────
    # Build a set of "name|team" strings for
    # fast O(1) duplicate lookup per row.
    existing_keys = await get_existing_player_keys(db, auction_id)

    # ── Step 4: Validate all rows ─────────────
    valid_players: list[PlayerCreate] = []
    errors: list[dict] = []
    skipped_duplicates = 0
    total_rows = 0

    for row_number, row in enumerate(reader, start=2):
        # row_number starts at 2 because row 1 is the header

        # ── Skip completely empty rows silently ──
        # A row is empty if all its values are blank
        if not any(v.strip() for v in row.values() if v):
            continue

        total_rows += 1

        # Normalize row keys to match expected casing
        # csv.DictReader uses the exact header strings as keys,
        # so we re-map them to "Name", "Team", "Role"
        normalized_row = {
            k.strip().capitalize(): v for k, v in row.items() if k
        }

        # ── Validate the row ──────────────────
        player_data, error_message = validate_csv_row(normalized_row, row_number)

        if error_message:
            errors.append({"row": row_number, "message": error_message})
            continue

        # ── Duplicate check ───────────────────
        # Build the same "name|team" key format
        # as get_existing_player_keys() uses
        duplicate_key = f"{player_data.name.lower()}|{player_data.team.lower()}"

        if duplicate_key in existing_keys:
            skipped_duplicates += 1
            continue

        # Mark this player as seen so we also catch
        # duplicates within the same CSV file
        existing_keys.add(duplicate_key)
        valid_players.append(player_data)

    # ── Step 5: Bulk insert valid players ─────
    # Build Player ORM objects from the validated
    # PlayerCreate schemas and add them all at once.
    # This is more efficient than inserting one by one.
    if valid_players:
        player_objects = [
            Player(
                auction_id=auction_id,
                name=p.name,
                team=p.team,
                role=p.role,
                value=p.value
            )
            for p in valid_players
        ]

        db.add_all(player_objects)
        await db.commit()

    # ── Step 6: Return import summary ─────────
    return {
        "total_rows":         total_rows,
        "imported":           len(valid_players),
        "skipped_duplicates": skipped_duplicates,
        "errors":             errors
    }