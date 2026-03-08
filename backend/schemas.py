import enum
from datetime import datetime
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field, model_validator

from models import AuctionStatus, PlayerRole, PlayerStatus, ROLE_LIMITS


# ─────────────────────────────────────────────
# TOKEN & AUTH
# Schemas used for JWT authentication flow
# ─────────────────────────────────────────────

class Token(BaseModel):
    """Returned to the client after a successful login."""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """
    Data encoded inside the JWT token.
    Decoded on every protected request to identify
    the current user and their auction context.
    """
    username: Optional[str] = None
    auction_id: Optional[str] = None
    manager_id: Optional[str] = None
    is_admin: Optional[bool] = False


# ─────────────────────────────────────────────
# AUCTION
# Schemas for creating, updating and returning
# auction session data
# ─────────────────────────────────────────────

class AuctionCreate(BaseModel):
    """
    Payload required to create a new auction.
    Sent by the admin when setting up the session.
    """
    name: str = Field(
        ...,
        min_length=2,
        max_length=100,
        description="Human-readable name for this auction session"
    )
    budget_per_team: int = Field(
        default=500,
        ge=100,
        le=5000,
        description="Starting budget (fantamilioni) assigned to each manager. Min 100, max 5000."
    )
    timer_seconds: int = Field(
        default=15,
        ge=5,
        le=120,
        description="Countdown timer in seconds for each bid round. Min 5s, max 120s."
    )


class AuctionUpdate(BaseModel):
    """
    Payload for updating an existing auction.
    All fields are optional — only send what needs changing.
    Typically used by admin to change status or timer.
    """
    status: Optional[AuctionStatus] = Field(
        default=None,
        description="New status for the auction (active, paused, completed)"
    )
    timer_seconds: Optional[int] = Field(
        default=None,
        ge=5,
        le=120,
        description="Updated timer duration in seconds"
    )
    current_caller_id: Optional[str] = Field(
        default=None,
        description="ID of the manager whose turn it is to call a player"
    )


class AuctionResponse(BaseModel):
    """
    Full auction data returned to the client.
    Includes the list of all managers in the session.
    """
    model_config = {"from_attributes": True}

    id: str
    name: str
    budget_per_team: int
    timer_seconds: int
    status: AuctionStatus
    current_caller_id: Optional[str] = None
    created_at: datetime

    # Populated via SQLAlchemy relationship
    # Will be an empty list before managers are added
    managers: List["ManagerResponse"] = []


# ─────────────────────────────────────────────
# MANAGER
# Schemas for manager creation, login and responses
# ─────────────────────────────────────────────

class ManagerCreate(BaseModel):
    """
    Payload to create a new manager (participant).
    Created by the admin before the auction starts.
    The plain text password will be hashed in auth.py
    before being stored — never stored as plain text.
    """
    username: str = Field(
        ...,
        min_length=2,
        max_length=50,
        description="Unique display name for this manager within the auction"
    )
    password: str = Field(
        ...,
        min_length=4,
        description="Plain text password — will be hashed before storage"
    )
    is_admin: bool = Field(
        default=False,
        description="Whether this manager has admin privileges (start/pause/stop)"
    )
    budget_remaining: Optional[int] = Field(
        default=None,
        ge=0,
        description="Starting budget — if not provided, defaults to auction's budget_per_team"
    )


class ManagerLogin(BaseModel):
    """Credentials submitted on the login page."""
    username: str = Field(..., description="Manager's username")
    password: str = Field(..., description="Manager's plain text password")


class ManagerResponse(BaseModel):
    """
    Manager data returned to the client.
    Includes the manager's current roster.
    Never exposes the hashed password.
    """
    model_config = {"from_attributes": True}

    id: str
    username: str
    is_admin: bool
    budget_remaining: int
    turn_order: Optional[int] = None
    is_connected: bool

    # Players won by this manager so far
    roster: List["PlayerResponse"] = []


# ─────────────────────────────────────────────
# PLAYER
# Schemas for individual players and the full pool
# ─────────────────────────────────────────────

class PlayerCreate(BaseModel):
    """
    Represents a single player row from the CSV import.
    The admin uploads a CSV and each valid row
    is parsed into one of these.
    """
    name: str = Field(
        ...,
        min_length=2,
        max_length=100,
        description="Player's full name"
    )
    team: str = Field(
        ...,
        min_length=2,
        max_length=100,
        description="Serie A team the player belongs to"
    )
    role: PlayerRole = Field(
        ...,
        description="Player role: P (Goalkeeper), D (Defender), C (Midfielder), A (Forward)"
    )
    value: int = Field(
        default=0,
        ge=0,
        description="Estimated market value in fantamilioni (FM). Defaults to 0 if not in CSV."
    )


class PlayerResponse(BaseModel):
    """
    Player data returned to the client.
    Shows current status — available or sold — and
    who bought them and at what price if sold.
    """
    model_config = {"from_attributes": True}

    id: str
    name: str
    team: str
    role: PlayerRole
    value: int = 0
    status: PlayerStatus
    sold_to_id: Optional[str] = None
    sold_price: Optional[int] = None


class PlayerListResponse(BaseModel):
    """
    The full player pool with summary counts.
    Useful for the auction room sidebar where managers
    browse available players before calling one.
    """
    players: List[PlayerResponse]

    # Total players per role still available
    available_counts: Dict[str, int] = Field(
        default_factory=dict,
        description="Number of available players per role e.g. {'P': 10, 'D': 40, ...}"
    )

    # Total players per role already sold
    sold_counts: Dict[str, int] = Field(
        default_factory=dict,
        description="Number of sold players per role"
    )

    # Convenience total fields
    total_available: int = 0
    total_sold: int = 0

    @model_validator(mode="before")
    @classmethod
    def compute_counts(cls, values: Any) -> Any:
        """
        Automatically calculates available/sold counts
        from the players list when the schema is created.
        No need to pass counts manually.
        """
        players = values.get("players", [])

        available_counts: Dict[str, int] = {role.value: 0 for role in PlayerRole}
        sold_counts: Dict[str, int] = {role.value: 0 for role in PlayerRole}

        for player in players:
            # Support both ORM objects and dicts
            role = player.role if hasattr(player, "role") else player.get("role")
            status = player.status if hasattr(player, "status") else player.get("status")

            role_key = role.value if hasattr(role, "value") else role
            status_val = status.value if hasattr(status, "value") else status

            if status_val == PlayerStatus.available.value:
                available_counts[role_key] = available_counts.get(role_key, 0) + 1
            else:
                sold_counts[role_key] = sold_counts.get(role_key, 0) + 1

        values["available_counts"] = available_counts
        values["sold_counts"] = sold_counts
        values["total_available"] = sum(available_counts.values())
        values["total_sold"] = sum(sold_counts.values())

        return values


# ─────────────────────────────────────────────
# BID
# Schemas for placing and returning bid data
# ─────────────────────────────────────────────

class BidCreate(BaseModel):
    """
    Payload sent by a manager when placing a bid.
    The amount must be at least 1 (minimum starting price).
    The server validates that the manager can afford it
    and that the role slot is not full.
    """
    player_id: str = Field(
        ...,
        description="ID of the player currently up for auction"
    )
    amount: int = Field(
        ...,
        ge=1,
        description="Bid amount in fantamilioni (credits). Minimum is 1."
    )


class BidResponse(BaseModel):
    """Full bid record returned to the client after a bid is placed."""
    model_config = {"from_attributes": True}

    id: str
    player_id: str
    manager_id: str
    amount: int
    timestamp: datetime


# ─────────────────────────────────────────────
# WEBSOCKET MESSAGES
# These are the real-time event payloads
# broadcast to all connected clients via WebSocket.
# Every message has a type and a payload dict.
# ─────────────────────────────────────────────

class WSMessageType(str, enum.Enum):
    """
    All possible WebSocket event types.
    The frontend listens for these and updates
    the UI accordingly.
    """
    BID_PLACED              = "BID_PLACED"               # A new bid was placed
    PLAYER_SOLD             = "PLAYER_SOLD"               # Timer expired, player sold
    TIMER_UPDATE            = "TIMER_UPDATE"              # Countdown tick (every second)
    TURN_CHANGED            = "TURN_CHANGED"              # Next manager's turn to call
    PLAYER_CALLED           = "PLAYER_CALLED"             # A manager called a player
    AUCTION_STATUS_CHANGED  = "AUCTION_STATUS_CHANGED"    # Admin started/paused/stopped
    MANAGER_CONNECTED       = "MANAGER_CONNECTED"         # A manager joined the room
    MANAGER_DISCONNECTED    = "MANAGER_DISCONNECTED"      # A manager left the room
    ERROR                   = "ERROR"                     # Something went wrong
    SYNC                    = "SYNC"                      # Full state sync (sent to a client when they connect/reconnect)


class WSMessage(BaseModel):
    """
    Wrapper for all WebSocket messages.
    Both server→client broadcasts and client→server
    events follow this structure.

    Example BID_PLACED payload:
    {
        "type": "BID_PLACED",
        "payload": {
            "manager_id": "...",
            "manager_username": "Luca",
            "player_id": "...",
            "player_name": "Barella",
            "amount": 42,
            "time_remaining": 11
        },
        "timestamp": "2025-08-01T20:15:00"
    }
    """
    type: WSMessageType = Field(..., description="Event type identifier")
    payload: Dict[str, Any] = Field(
        default_factory=dict,
        description="Event-specific data. Structure varies by message type."
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Server timestamp when the event was generated"
    )


# ─────────────────────────────────────────────
# RECAP & EXPORT
# Schemas for the post-auction summary screen
# and CSV/PDF export
# ─────────────────────────────────────────────

class ManagerRecap(BaseModel):
    """
    Post-auction summary for a single manager.
    Shows their full roster broken down by role
    and their budget usage.
    """
    model_config = {"from_attributes": True}

    manager_id: str
    username: str
    budget_spent: int = Field(description="Total credits spent on players")
    budget_remaining: int = Field(description="Credits left after the auction")

    # Roster broken down by role for easy reading
    goalkeepers: List[PlayerResponse] = Field(
        default_factory=list,
        description="Portieri (P) — max 3"
    )
    defenders: List[PlayerResponse] = Field(
        default_factory=list,
        description="Difensori (D) — max 8"
    )
    midfielders: List[PlayerResponse] = Field(
        default_factory=list,
        description="Centrocampisti (C) — max 8"
    )
    forwards: List[PlayerResponse] = Field(
        default_factory=list,
        description="Attaccanti (A) — max 6"
    )

    # Slot usage per role e.g. {"P": "2/3", "D": "8/8", ...}
    slot_usage: Dict[str, str] = Field(
        default_factory=dict,
        description="Filled/total slots per role"
    )

    @model_validator(mode="before")
    @classmethod
    def compute_slot_usage(cls, values: Any) -> Any:
        """Auto-computes slot usage from the roster lists."""
        slot_usage = {
            "P": f"{len(values.get('goalkeepers', []))}/{ROLE_LIMITS[PlayerRole.P]}",
            "D": f"{len(values.get('defenders', []))}/{ROLE_LIMITS[PlayerRole.D]}",
            "C": f"{len(values.get('midfielders', []))}/{ROLE_LIMITS[PlayerRole.C]}",
            "A": f"{len(values.get('forwards', []))}/{ROLE_LIMITS[PlayerRole.A]}",
        }
        values["slot_usage"] = slot_usage
        return values


class AuctionRecap(BaseModel):
    """
    Full post-auction summary.
    Returned at the end of the auction and available
    for revisiting via the results page.
    """
    auction_id: str
    auction_name: str
    total_managers: int
    total_players_sold: int
    completed_at: Optional[datetime] = None

    # One recap entry per manager
    managers: List[ManagerRecap] = Field(
        default_factory=list,
        description="Per-manager recap including full roster and budget info"
    )


# ─────────────────────────────────────────────
# Forward reference resolution
# Required because AuctionResponse references
# ManagerResponse and ManagerResponse references
# PlayerResponse — all defined in this same file.
# Pydantic needs this call to resolve the circular
# references correctly.
# ─────────────────────────────────────────────
AuctionResponse.model_rebuild()
ManagerResponse.model_rebuild()
