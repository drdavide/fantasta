import csv
import io
from datetime import datetime
from typing import List, Dict

from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle,
    Paragraph, Spacer, PageBreak, HRFlowable
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT

from models import Manager, Player, Auction, PlayerRole
from schemas import AuctionRecap, ManagerRecap, PlayerResponse


# ─────────────────────────────────────────────
# ROLE HELPERS
# ─────────────────────────────────────────────

def _role_display_name(role: PlayerRole) -> str:
    """
    Returns the Italian display name for a player role.

    Used in export headers and table rows so the output
    is readable for Italian Fantacalcio users.

    Args:
        role: A PlayerRole enum value (P, D, C, A)

    Returns:
        Italian role name string.
    """
    names = {
        PlayerRole.P: "Portiere",
        PlayerRole.D: "Difensore",
        PlayerRole.C: "Centrocampista",
        PlayerRole.A: "Attaccante",
    }
    return names.get(role, role.value)


def _role_display_name_plural(role: PlayerRole) -> str:
    """
    Returns the Italian plural display name for a player role.
    Used for section headers in exports.
    """
    names = {
        PlayerRole.P: "Portieri",
        PlayerRole.D: "Difensori",
        PlayerRole.C: "Centrocampisti",
        PlayerRole.A: "Attaccanti",
    }
    return names.get(role, role.value)


def _role_sort_key(role: PlayerRole) -> int:
    """
    Returns a sort order integer for a player role.

    Ensures players are always grouped in the standard
    Fantacalcio order: P → D → C → A.

    Args:
        role: A PlayerRole enum value.

    Returns:
        Sort key integer: P=0, D=1, C=2, A=3
    """
    order = {
        PlayerRole.P: 0,
        PlayerRole.D: 1,
        PlayerRole.C: 2,
        PlayerRole.A: 3,
    }
    return order.get(role, 99)


# ─────────────────────────────────────────────
# GET AUCTION RECAP
#
# Core data-gathering function used by both
# CSV and PDF exports. Queries the DB and builds
# a structured AuctionRecap object.
# ─────────────────────────────────────────────

async def get_auction_recap(
    auction_id: str,
    db: AsyncSession
) -> AuctionRecap:
    """
    Query the database and build a full AuctionRecap for an auction.

    For each manager:
    - Loads their full roster of sold players
    - Splits players into role groups (P, D, C, A)
    - Calculates budget_spent and budget_remaining
    - Builds a ManagerRecap schema object

    Args:
        auction_id: The UUID of the auction to recap.
        db:         Async DB session.

    Returns:
        A populated AuctionRecap schema object.

    Raises:
        ValueError: If the auction is not found.
    """
    # Load the auction
    auction_result = await db.execute(
        select(Auction).where(Auction.id == auction_id)
    )
    auction = auction_result.scalar_one_or_none()

    if auction is None:
        raise ValueError(f"Auction '{auction_id}' not found.")

    # Load all non-admin managers for this auction
    managers_result = await db.execute(
        select(Manager).where(
            Manager.auction_id == auction_id,
            Manager.is_admin == False  # noqa: E712
        ).order_by(Manager.turn_order)
    )
    managers: List[Manager] = list(managers_result.scalars().all())

    manager_recaps: List[ManagerRecap] = []

    for manager in managers:
        # Load all players won by this manager
        players_result = await db.execute(
            select(Player).where(
                Player.sold_to_id == manager.id
            )
        )
        roster: List[Player] = list(players_result.scalars().all())

        # Sort players by role order (P → D → C → A)
        roster.sort(key=lambda p: _role_sort_key(p.role))

        # Split roster into role groups
        goalkeepers = [
            PlayerResponse.model_validate(p)
            for p in roster if p.role == PlayerRole.P
        ]
        defenders = [
            PlayerResponse.model_validate(p)
            for p in roster if p.role == PlayerRole.D
        ]
        midfielders = [
            PlayerResponse.model_validate(p)
            for p in roster if p.role == PlayerRole.C
        ]
        forwards = [
            PlayerResponse.model_validate(p)
            for p in roster if p.role == PlayerRole.A
        ]

        # Calculate budget spent
        # sold_price is always at least 1 (starting price)
        budget_spent = sum(p.sold_price or 0 for p in roster)

        manager_recaps.append(
            ManagerRecap(
                manager_id=manager.id,
                username=manager.username,
                budget_spent=budget_spent,
                budget_remaining=manager.budget_remaining,
                goalkeepers=goalkeepers,
                defenders=defenders,
                midfielders=midfielders,
                forwards=forwards,
            )
        )

    return AuctionRecap(
        auction_id=auction_id,
        auction_name=auction.name,
        total_managers=len(managers),
        total_players_sold=sum(len(m.goalkeepers) + len(m.defenders) + len(m.midfielders) + len(m.forwards) for m in manager_recaps),
        completed_at=datetime.utcnow(),
        managers=manager_recaps,
    )


# ─────────────────────────────────────────────
# CSV EXPORT
#
# Generates a structured CSV file in memory
# and returns it as a StreamingResponse.
#
# Structure:
#   Auction Name, Date
#   (empty row)
#   --- Manager: Username ---
#   Budget Speso: X | Budget Rimanente: Y
#   Ruolo, Nome, Squadra, Prezzo
#   P, Donnarumma, PSG, 45
#   ...
#   (empty row between managers)
# ─────────────────────────────────────────────

async def export_csv(
    auction_id: str,
    db: AsyncSession
) -> StreamingResponse:
    """
    Generate and return a CSV export of the auction results.

    Uses Python's built-in csv module and writes to an
    in-memory io.StringIO buffer — no temp files needed.

    The CSV is structured with a section per manager,
    showing their full roster grouped by role with prices.

    Args:
        auction_id: The UUID of the auction to export.
        db:         Async DB session.

    Returns:
        A FastAPI StreamingResponse with content-type text/csv.
        The browser will prompt a file download named "asta_risultati.csv".
    """
    recap = await get_auction_recap(auction_id, db)

    # Write to an in-memory string buffer
    output = io.StringIO()
    writer = csv.writer(output)

    # ── Header ────────────────────────────────
    writer.writerow(["Fantacalcio — Risultati Asta"])
    writer.writerow([
        f"Asta: {recap.auction_name}",
        f"Data: {datetime.utcnow().strftime('%d/%m/%Y %H:%M')}",
        f"Fantamanager: {recap.total_managers}",
        f"Giocatori venduti: {recap.total_players_sold}",
    ])
    writer.writerow([])  # Empty separator row

    # ── One section per manager ───────────────
    for manager_recap in recap.managers:
        # Manager header
        writer.writerow([f"{'─' * 60}"])
        writer.writerow([f"FANTAMANAGER: {manager_recap.username.upper()}"])
        writer.writerow([
            f"Budget Speso: {manager_recap.budget_spent}",
            f"Budget Rimanente: {manager_recap.budget_remaining}",
            f"Giocatori: {len(manager_recap.goalkeepers) + len(manager_recap.defenders) + len(manager_recap.midfielders) + len(manager_recap.forwards)}/25",
        ])
        writer.writerow([])

        # Column headers for player rows
        writer.writerow(["Ruolo", "Nome", "Squadra", "Prezzo (FM)"])

        # Group players by role in standard order
        role_groups: Dict[str, list] = {
            "Portieri":        manager_recap.goalkeepers,
            "Difensori":       manager_recap.defenders,
            "Centrocampisti":  manager_recap.midfielders,
            "Attaccanti":      manager_recap.forwards,
        }

        for role_label, players in role_groups.items():
            if not players:
                continue

            # Role group header row
            writer.writerow([f"[ {role_label} ]", "", "", ""])

            for player in players:
                writer.writerow([
                    player.role.value,
                    player.name,
                    player.team,
                    player.sold_price or 1,
                ])

        writer.writerow([])  # Empty row between managers

    # ── Summary totals ────────────────────────
    writer.writerow([f"{'─' * 60}"])
    writer.writerow(["RIEPILOGO GENERALE"])
    writer.writerow(["Fantamanager", "Giocatori", "Budget Speso", "Budget Rimanente"])
    for manager_recap in recap.managers:
        total_players = (
            len(manager_recap.goalkeepers) +
            len(manager_recap.defenders) +
            len(manager_recap.midfielders) +
            len(manager_recap.forwards)
        )
        writer.writerow([
            manager_recap.username,
            f"{total_players}/25",
            manager_recap.budget_spent,
            manager_recap.budget_remaining,
        ])

    # ── Return as streaming response ──────────
    # Seek back to the start of the buffer before reading
    output.seek(0)

    filename = f"asta_{recap.auction_name.replace(' ', '_').lower()}_risultati.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


# ─────────────────────────────────────────────
# PDF EXPORT
#
# Generates a styled PDF using ReportLab and
# returns it as a FastAPI Response.
#
# Structure per manager:
#   - Manager name header (bold, large)
#   - Budget info line
#   - Roster table with alternating row colours
#   - Role group headers in bold italic
#   - Page break between managers
# ─────────────────────────────────────────────

async def export_pdf(
    auction_id: str,
    db: AsyncSession
) -> Response:
    """
    Generate and return a PDF export of the auction results.

    Uses ReportLab's Platypus (high-level layout engine) to build
    a structured, styled PDF document in an in-memory BytesIO buffer.

    Layout per page:
    - Auction title and date at the top
    - One section per manager with their roster in a styled table
    - Alternating grey/white row colours for readability
    - Bold role group headers (Portieri, Difensori, etc.)
    - Page number footer on every page
    - Page break between managers

    Args:
        auction_id: The UUID of the auction to export.
        db:         Async DB session.

    Returns:
        A FastAPI Response with content-type application/pdf.
        The browser will prompt a file download named "asta_risultati.pdf".
    """
    recap = await get_auction_recap(auction_id, db)

    # Write PDF to an in-memory bytes buffer
    buffer = io.BytesIO()

    # ── Document setup ────────────────────────
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2.5 * cm,
        title=f"Asta Fantacalcio — {recap.auction_name}",
        author="Fantacalcio Asta App",
    )

    # ── Styles ────────────────────────────────
    base_styles = getSampleStyleSheet()

    style_title = ParagraphStyle(
        "AstaTitle",
        parent=base_styles["Title"],
        fontSize=22,
        textColor=colors.HexColor("#1a1a2e"),
        spaceAfter=6,
        alignment=TA_CENTER,
        fontName="Helvetica-Bold",
    )
    style_subtitle = ParagraphStyle(
        "AstaSubtitle",
        parent=base_styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#555555"),
        spaceAfter=20,
        alignment=TA_CENTER,
    )
    style_manager_header = ParagraphStyle(
        "ManagerHeader",
        parent=base_styles["Heading1"],
        fontSize=14,
        textColor=colors.HexColor("#ffffff"),
        backColor=colors.HexColor("#1a1a2e"),
        spaceAfter=4,
        spaceBefore=10,
        fontName="Helvetica-Bold",
        leftIndent=6,
        rightIndent=6,
        borderPad=6,
    )
    style_budget_info = ParagraphStyle(
        "BudgetInfo",
        parent=base_styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#333333"),
        spaceAfter=8,
        fontName="Helvetica",
    )
    style_role_header = ParagraphStyle(
        "RoleHeader",
        parent=base_styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#1a1a2e"),
        fontName="Helvetica-BoldOblique",
        spaceBefore=4,
        spaceAfter=2,
    )
    style_summary_title = ParagraphStyle(
        "SummaryTitle",
        parent=base_styles["Heading2"],
        fontSize=13,
        textColor=colors.HexColor("#1a1a2e"),
        fontName="Helvetica-Bold",
        spaceBefore=10,
        spaceAfter=8,
    )

    # Colour palette
    COLOR_ROW_ODD  = colors.HexColor("#f4f6fb")   # Light blue-grey for odd rows
    COLOR_ROW_EVEN = colors.white                  # White for even rows
    COLOR_HEADER   = colors.HexColor("#1a1a2e")    # Dark navy for table headers
    COLOR_ROLE_P   = colors.HexColor("#e8f4fd")    # Light blue  — Portieri
    COLOR_ROLE_D   = colors.HexColor("#e8fde8")    # Light green — Difensori
    COLOR_ROLE_C   = colors.HexColor("#fdf8e8")    # Light yellow — Centrocampisti
    COLOR_ROLE_A   = colors.HexColor("#fde8e8")    # Light red — Attaccanti

    role_row_colors = {
        PlayerRole.P: COLOR_ROLE_P,
        PlayerRole.D: COLOR_ROLE_D,
        PlayerRole.C: COLOR_ROLE_C,
        PlayerRole.A: COLOR_ROLE_A,
    }

    # ── Build content (story) ─────────────────
    # ReportLab Platypus works by building a list
    # of "flowable" objects (Paragraphs, Tables, etc.)
    # and then rendering them into pages automatically.
    story = []

    # ── Cover header ─────────────────────────
    story.append(Paragraph("⚽ Fantacalcio", style_title))
    story.append(Paragraph(
        f"Risultati Asta — <b>{recap.auction_name}</b>",
        style_title
    ))
    story.append(Paragraph(
        f"Data: {datetime.utcnow().strftime('%d/%m/%Y %H:%M')}  •  "
        f"Fantamanager: {recap.total_managers}  •  "
        f"Giocatori venduti: {recap.total_players_sold}",
        style_subtitle
    ))
    story.append(HRFlowable(
        width="100%",
        thickness=2,
        color=colors.HexColor("#1a1a2e"),
        spaceAfter=16
    ))

    # ── One section per manager ───────────────
    for manager_index, manager_recap in enumerate(recap.managers):
        total_players = (
            len(manager_recap.goalkeepers) +
            len(manager_recap.defenders) +
            len(manager_recap.midfielders) +
            len(manager_recap.forwards)
        )

        # Manager name header
        story.append(Paragraph(
            f"  {manager_recap.username}",
            style_manager_header
        ))

        # Budget info
        story.append(Paragraph(
            f"&nbsp;&nbsp;<b>Budget Speso:</b> {manager_recap.budget_spent} FM  •  "
            f"<b>Budget Rimanente:</b> {manager_recap.budget_remaining} FM  •  "
            f"<b>Giocatori:</b> {total_players}/25",
            style_budget_info
        ))

        # ── Roster table ──────────────────────
        # Build table data: one row per player
        # plus a role group header row before each role.
        #
        # Table columns: Ruolo | Nome | Squadra | Prezzo
        table_data = []
        table_row_colors = []  # Track background colour per row

        # Column header row
        table_data.append(["Ruolo", "Nome", "Squadra", "Prezzo (FM)"])
        table_row_colors.append(COLOR_HEADER)

        # Role groups in standard order
        role_groups = [
            (PlayerRole.P, manager_recap.goalkeepers),
            (PlayerRole.D, manager_recap.defenders),
            (PlayerRole.C, manager_recap.midfielders),
            (PlayerRole.A, manager_recap.forwards),
        ]

        for role, players in role_groups:
            if not players:
                continue

            # Role group header row (e.g. "Portieri (2/3)")
            role_limit_map = {
                PlayerRole.P: 3,
                PlayerRole.D: 8,
                PlayerRole.C: 8,
                PlayerRole.A: 6,
            }
            limit = role_limit_map[role]
            table_data.append([
                f"{_role_display_name_plural(role)} ({len(players)}/{limit})",
                "", "", ""
            ])
            table_row_colors.append(role_row_colors[role])

            # Player rows
            for player in players:
                table_data.append([
                    player.role.value,
                    player.name,
                    player.team,
                    str(player.sold_price or 1),
                ])
                table_row_colors.append(role_row_colors[role])

        # ── Table styling ──────────────────────
        # Build TableStyle commands dynamically
        # based on row types (header vs role group vs player).
        table_style_commands = [
            # Global table style
            ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",    (0, 0), (-1, 0), 9),
            ("TEXTCOLOR",   (0, 0), (-1, 0), colors.white),
            ("BACKGROUND",  (0, 0), (-1, 0), COLOR_HEADER),
            ("ALIGN",       (0, 0), (-1, -1), "LEFT"),
            ("ALIGN",       (3, 0), (3, -1), "CENTER"),  # Price column centered
            ("FONTSIZE",    (0, 1), (-1, -1), 8),
            ("FONTNAME",    (0, 1), (-1, -1), "Helvetica"),
            ("ROWBACKGROUND", (0, 0), (-1, -1), [
                table_row_colors[i] for i in range(len(table_row_colors))
            ]),
            ("GRID",        (0, 0), (-1, -1), 0.3, colors.HexColor("#cccccc")),
            ("TOPPADDING",  (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]

        # Style role group header rows (bold, slightly larger text)
        row_index = 1  # Start after the column header
        for role, players in role_groups:
            if not players:
                continue
            # Role group header row
            table_style_commands.extend([
                ("FONTNAME",  (0, row_index), (-1, row_index), "Helvetica-Bold"),
                ("FONTSIZE",  (0, row_index), (-1, row_index), 8),
                ("SPAN",      (0, row_index), (-1, row_index)),  # Merge role header across all columns
            ])
            row_index += 1 + len(players)  # Skip past player rows

        table = Table(
            table_data,
            colWidths=[1.5 * cm, 6.5 * cm, 4.5 * cm, 2.5 * cm],
            repeatRows=1,  # Repeat column header on each page if table spans pages
        )
        table.setStyle(TableStyle(table_style_commands))

        story.append(table)
        story.append(Spacer(1, 0.5 * cm))

        # Page break between managers (except after the last one)
        if manager_index < len(recap.managers) - 1:
            story.append(PageBreak())

    # ── Summary table ─────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("Riepilogo Generale", style_summary_title))
    story.append(HRFlowable(
        width="100%",
        thickness=1,
        color=colors.HexColor("#1a1a2e"),
        spaceAfter=10
    ))

    summary_data = [["Fantamanager", "Giocatori", "Budget Speso (FM)", "Budget Rimanente (FM)"]]
    for manager_recap in recap.managers:
        total_players = (
            len(manager_recap.goalkeepers) +
            len(manager_recap.defenders) +
            len(manager_recap.midfielders) +
            len(manager_recap.forwards)
        )
        summary_data.append([
            manager_recap.username,
            f"{total_players}/25",
            str(manager_recap.budget_spent),
            str(manager_recap.budget_remaining),
        ])

    summary_table = Table(
        summary_data,
        colWidths=[5 * cm, 3 * cm, 4.5 * cm, 4.5 * cm],
    )
    summary_table.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), COLOR_HEADER),
        ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 9),
        ("ALIGN",         (1, 0), (-1, -1), "CENTER"),
        ("ROWBACKGROUND", (0, 1), (-1, -1), [
            COLOR_ROW_ODD if i % 2 == 0 else COLOR_ROW_EVEN
            for i in range(len(summary_data) - 1)
        ]),
        ("GRID",          (0, 0), (-1, -1), 0.3, colors.HexColor("#cccccc")),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
    ]))

    story.append(summary_table)

    # ── Page number footer ────────────────────
    # ReportLab calls this function on every page.
    # It draws the footer text at the bottom of each page.
    def add_page_number(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#888888"))
        page_text = f"Fantacalcio Asta — {recap.auction_name} — Pagina {doc.page}"
        canvas.drawCentredString(A4[0] / 2, 1.2 * cm, page_text)
        canvas.restoreState()

    # ── Build PDF ─────────────────────────────
    # This triggers ReportLab to render everything
    # in story[] into actual PDF pages in the buffer.
    doc.build(
        story,
        onFirstPage=add_page_number,
        onLaterPages=add_page_number,
    )

    # Rewind buffer to the beginning before reading
    buffer.seek(0)
    pdf_bytes = buffer.read()

    filename = f"asta_{recap.auction_name.replace(' ', '_').lower()}_risultati.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )