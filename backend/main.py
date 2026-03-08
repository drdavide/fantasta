# ─────────────────────────────────────────────
# main.py
# Entry point for the Fantacalcio Asta API.
# Ties together all modules and registers all routes.
# ─────────────────────────────────────────────

from contextlib import asynccontextmanager
from typing import List, Optional

import uvicorn
from fastapi import (
    FastAPI, Depends, HTTPException, status,
    UploadFile, File, Query, WebSocket
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from database import init_db, get_db, AsyncSessionLocal
from models import Auction, Manager, Player, PlayerStatus, PlayerRole
from schemas import (
    Token,
    AuctionCreate, AuctionUpdate, AuctionResponse,
    ManagerCreate, ManagerResponse,
    PlayerResponse, PlayerListResponse,
)
from auth import (
    authenticate_manager, create_access_token,
    get_current_manager, get_current_admin, hash_password
)
from csv_import import import_players_from_csv
from export import export_csv, export_pdf
from websocket_manager import connection_manager, auction_websocket
from schemas import ManagerRecap, AuctionRecap


# ─────────────────────────────────────────────
# LIFESPAN
# Runs once on startup and once on shutdown.
# Modern FastAPI replacement for @app.on_event.
# ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # STARTUP
    await init_db()
    print("\n===========================================")
    print("  ⚽  Fantacalcio Asta API  — Running!")
    print("===========================================")
    print("  Docs:      http://localhost:8000/docs")
    print("  Redoc:     http://localhost:8000/redoc")
    print("  WebSocket: ws://localhost:8000/ws/{auction_id}?token=JWT")
    print("===========================================\n")
    yield
    # SHUTDOWN
    print("\nFantacalcio Asta API shutting down. Ciao! 👋\n")


# ─────────────────────────────────────────────
# APP CREATION
# ─────────────────────────────────────────────

app = FastAPI(
    title="Fantacalcio Asta API",
    description=(
        "Real-time auction (asta) backend for Italian Fantasy Football — Serie A. "
        "Supports chiamata-style bidding with live WebSocket updates."
    ),
    version="1.0.0",
    lifespan=lifespan,
)


# ─────────────────────────────────────────────
# CORS MIDDLEWARE
# Allows the React frontend (running on a
# different port e.g. localhost:5173) to call
# this API during local development.
# ─────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # Allow all origins in dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# ROOT — HEALTH CHECK
# ─────────────────────────────────────────────

@app.get("/", tags=["Health"])
async def root():
    """API health check. Returns app status and version."""
    return {
        "status": "ok",
        "app": "Fantacalcio Asta API",
        "version": "1.0.0",
    }


# ─────────────────────────────────────────────
# AUTH ROUTES
# ─────────────────────────────────────────────

@app.post(
    "/auth/login",
    response_model=Token,
    tags=["Auth"],
    summary="Login and receive a JWT token"
)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticate a manager with username and password.
    Returns a JWT Bearer token valid for 8 hours.
    Use this token in the Authorization header for all protected routes.
    """
    manager = await authenticate_manager(db, form_data.username, form_data.password)

    if not manager:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenziali non valide. Controlla username e password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(data={
        "username": manager.username,
        "manager_id": manager.id,
        "auction_id": manager.auction_id,
        "is_admin": manager.is_admin,
    })

    return Token(access_token=token, token_type="bearer")


@app.post(
    "/auth/logout",
    tags=["Auth"],
    summary="Logout (client discards token)"
)
async def logout(
    current_manager: Manager = Depends(get_current_manager)
):
    """
    Logout endpoint. Since JWT is stateless, the server doesn't
    store tokens — the client simply discards it.
    This route is here for completeness and frontend convenience.
    """
    return {"message": f"Arrivederci, {current_manager.username}! Logout effettuato."}


# ─────────────────────────────────────────────
# AUCTION ROUTES
# ─────────────────────────────────────────────

@app.post(
    "/auction/",
    response_model=AuctionResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Auction"],
    summary="Create a new auction (admin only)"
)
async def create_auction(
    auction_data: AuctionCreate,
    admin: Manager = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Admin only. Create a new Fantacalcio auction session.
    Sets the name, budget per team, and timer duration.
    """
    try:
        new_auction = Auction(
            name=auction_data.name,
            budget_per_team=auction_data.budget_per_team,
            timer_seconds=auction_data.timer_seconds,
        )
        db.add(new_auction)
        await db.commit()

        # Reload with relationships
        result = await db.execute(
            select(Auction)
            .where(Auction.id == new_auction.id)
            .options(selectinload(Auction.managers))
        )
        return AuctionResponse.model_validate(result.scalar_one())

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore nella creazione dell'asta: {str(e)}")


@app.get(
    "/auction/{auction_id}",
    response_model=AuctionResponse,
    tags=["Auction"],
    summary="Get auction details"
)
async def get_auction(
    auction_id: str,
    current_manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db)
):
    """
    Get full auction details including all managers and their rosters.
    Any authenticated manager can access this.
    """
    result = await db.execute(
        select(Auction)
        .where(Auction.id == auction_id)
        .options(
            selectinload(Auction.managers)
            .selectinload(Manager.roster)
        )
    )
    auction = result.scalar_one_or_none()

    if not auction:
        raise HTTPException(status_code=404, detail="Asta non trovata.")

    return AuctionResponse.model_validate(auction)


@app.patch(
    "/auction/{auction_id}",
    response_model=AuctionResponse,
    tags=["Auction"],
    summary="Update auction fields (admin only)"
)
async def update_auction(
    auction_id: str,
    update_data: AuctionUpdate,
    admin: Manager = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Admin only. Update auction status, timer duration, or current caller.
    Only non-null fields in the request body are updated.
    """
    result = await db.execute(
        select(Auction).where(Auction.id == auction_id)
    )
    auction = result.scalar_one_or_none()

    if not auction:
        raise HTTPException(status_code=404, detail="Asta non trovata.")

    if update_data.status is not None:
        auction.status = update_data.status
    if update_data.timer_seconds is not None:
        auction.timer_seconds = update_data.timer_seconds
    if update_data.current_caller_id is not None:
        auction.current_caller_id = update_data.current_caller_id

    await db.commit()

    result = await db.execute(
        select(Auction)
        .where(Auction.id == auction_id)
        .options(selectinload(Auction.managers))
    )
    return AuctionResponse.model_validate(result.scalar_one())


# ─────────────────────────────────────────────
# MANAGER ROUTES
# ─────────────────────────────────────────────

@app.post(
    "/auction/{auction_id}/managers",
    response_model=ManagerResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Managers"],
    summary="Add a manager to the auction (admin only)"
)
async def create_manager(
    auction_id: str,
    manager_data: ManagerCreate,
    admin: Manager = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Admin only. Create a manager (participant) for the auction.
    Password is hashed before storage — never stored as plain text.
    Budget defaults to the auction's budget_per_team if not specified.
    """
    # Load the auction to get default budget
    result = await db.execute(
        select(Auction).where(Auction.id == auction_id)
    )
    auction = result.scalar_one_or_none()

    if not auction:
        raise HTTPException(status_code=404, detail="Asta non trovata.")

    # Check username is unique within this auction
    existing = await db.execute(
        select(Manager).where(
            Manager.auction_id == auction_id,
            Manager.username == manager_data.username
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"Username '{manager_data.username}' già in uso in questa asta."
        )

    # Use auction budget if not explicitly provided
    budget = manager_data.budget_remaining \
        if manager_data.budget_remaining is not None \
        else auction.budget_per_team

    new_manager = Manager(
        auction_id=auction_id,
        username=manager_data.username,
        hashed_password=hash_password(manager_data.password),
        is_admin=manager_data.is_admin,
        budget_remaining=budget,
    )
    db.add(new_manager)
    await db.commit()

    result = await db.execute(
        select(Manager)
        .where(Manager.id == new_manager.id)
        .options(selectinload(Manager.roster))
    )
    return ManagerResponse.model_validate(result.scalar_one())


@app.get(
    "/auction/{auction_id}/managers",
    response_model=List[ManagerResponse],
    tags=["Managers"],
    summary="List all managers in the auction"
)
async def list_managers(
    auction_id: str,
    current_manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all managers participating in the auction,
    ordered by turn_order. Includes their rosters.
    """
    result = await db.execute(
        select(Manager)
        .where(Manager.auction_id == auction_id)
        .options(selectinload(Manager.roster))
        .order_by(Manager.turn_order)
    )
    managers = result.scalars().all()
    return [ManagerResponse.model_validate(m) for m in managers]


@app.get(
    "/auction/{auction_id}/managers/me",
    response_model=ManagerResponse,
    tags=["Managers"],
    summary="Get my own manager profile and roster"
)
async def get_my_profile(
    auction_id: str,
    current_manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db)
):
    """
    Get the current logged-in manager's full profile,
    including their complete roster with player details.
    """
    result = await db.execute(
        select(Manager)
        .where(Manager.id == current_manager.id)
        .options(selectinload(Manager.roster))
    )
    manager = result.scalar_one_or_none()

    if not manager:
        raise HTTPException(status_code=404, detail="Manager non trovato.")

    return ManagerResponse.model_validate(manager)


# ─────────────────────────────────────────────
# PLAYER ROUTES
# ─────────────────────────────────────────────

@app.post(
    "/auction/{auction_id}/players/import",
    tags=["Players"],
    summary="Import players from CSV (admin only)"
)
async def import_players(
    auction_id: str,
    file: UploadFile = File(..., description="CSV file with columns: Name, Team, Role"),
    admin: Manager = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Admin only. Upload a CSV file to populate the player pool.
    Expected columns: Name, Team, Role (P/D/C/A).
    Returns a summary of imported, skipped, and errored rows.
    """
    # Validate file type
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Il file deve essere in formato CSV (.csv)."
        )

    try:
        summary = await import_players_from_csv(file, auction_id, db)
        return {
            "message": f"Importazione completata. {summary['imported']} giocatori importati.",
            **summary
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore durante l'importazione: {str(e)}")


@app.get(
    "/auction/{auction_id}/players",
    response_model=PlayerListResponse,
    tags=["Players"],
    summary="Get full player pool with counts"
)
async def list_players(
    auction_id: str,
    current_manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all players in the auction pool (available and sold),
    with summary counts per role. Used for the auction room sidebar.
    """
    result = await db.execute(
        select(Player)
        .where(Player.auction_id == auction_id)
        .order_by(Player.role, Player.name)
    )
    players = result.scalars().all()
    player_responses = [PlayerResponse.model_validate(p) for p in players]

    return PlayerListResponse(players=player_responses)


@app.get(
    "/auction/{auction_id}/players/available",
    response_model=List[PlayerResponse],
    tags=["Players"],
    summary="Get available players, optionally filtered by role"
)
async def list_available_players(
    auction_id: str,
    role: Optional[PlayerRole] = Query(
        default=None,
        description="Filter by role: P, D, C, or A"
    ),
    current_manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all players not yet sold. Optionally filter by role.
    Used by the caller to browse and pick a player to nominate.
    """
    query = select(Player).where(
        Player.auction_id == auction_id,
        Player.status == PlayerStatus.available
    )

    if role is not None:
        query = query.where(Player.role == role)

    query = query.order_by(Player.name)
    result = await db.execute(query)
    players = result.scalars().all()

    return [PlayerResponse.model_validate(p) for p in players]


# ─────────────────────────────────────────────
# EXPORT ROUTES
# ─────────────────────────────────────────────

@app.get(
    "/auction/{auction_id}/export/csv",
    tags=["Export"],
    summary="Export auction results as CSV"
)
async def download_csv(
    auction_id: str,
    current_manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db)
):
    """
    Download the full auction results as a CSV file.
    Shows each manager's roster grouped by role with prices paid.
    """
    try:
        return await export_csv(auction_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get(
    "/auction/{auction_id}/export/pdf",
    tags=["Export"],
    summary="Export auction results as PDF"
)
async def download_pdf(
    auction_id: str,
    current_manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db)
):
    """
    Download the full auction results as a styled PDF file.
    Includes each manager's roster with role sections and budget summary.
    """
    try:
        return await export_pdf(auction_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─────────────────────────────────────────────
# WEBSOCKET ROUTE
#
# Browser WebSocket APIs don't support custom
# headers, so the JWT is passed as a query param:
# ws://localhost:8000/ws/{auction_id}?token=<jwt>
#
# We cannot use Depends(get_db) directly in a
# WebSocket route the same way as HTTP routes.
# Instead we manually create a DB session and
# pass it to the handler function.
# ─────────────────────────────────────────────

@app.websocket("/ws/{auction_id}")
async def websocket_route(
    websocket: WebSocket,
    auction_id: str,
    token: str = Query(..., description="JWT Bearer token for authentication")
):
    """
    WebSocket endpoint for the live auction room.

    Connect with: ws://localhost:8000/ws/{auction_id}?token=<your_jwt>

    After connecting:
    - You will receive a sync message with the current auction state
    - Send JSON messages to call players or place bids
    - Receive real-time broadcast messages for all auction events
    """
    # Manually create a DB session for the WebSocket connection.
    # The session stays open for the entire WebSocket lifetime.
    async with AsyncSessionLocal() as db:
        await auction_websocket(
            websocket=websocket,
            auction_id=auction_id,
            token=token,
            db=db
        )

@app.get(
    "/auction/{auction_id}/export/recap",
    response_model=AuctionRecap,
    tags=["Export"],
    summary="Get post-auction recap as JSON"
)
async def get_recap(
    auction_id: str,
    current_manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Auction)
        .where(Auction.id == auction_id)
        .options(
            selectinload(Auction.managers)
            .selectinload(Manager.roster)
        )
    )
    auction = result.scalar_one_or_none()
    if not auction:
        raise HTTPException(status_code=404, detail="Asta non trovata.")

    manager_recaps = []
    for m in auction.managers:
        roster = m.roster or []
        budget_spent = sum(p.sold_price or 0 for p in roster)
        manager_recaps.append(ManagerRecap(
            manager_id=m.id,
            username=m.username,
            budget_spent=budget_spent,
            budget_remaining=m.budget_remaining,
            goalkeepers=[p for p in roster if p.role == PlayerRole.P],
            defenders=[p for p in roster if p.role == PlayerRole.D],
            midfielders=[p for p in roster if p.role == PlayerRole.C],
            forwards=[p for p in roster if p.role == PlayerRole.A],
            slot_usage={...}  # compute based on your rules
        ))

    return AuctionRecap(
        auction_id=auction.id,
        auction_name=auction.name,
        total_managers=len(auction.managers),
        total_players_sold=sum(len(m.roster or []) for m in auction.managers),
        completed_at=str(auction.updated_at) if auction.status == "completed" else None,
        managers=manager_recaps,
    )

# ─────────────────────────────────────────────
# ENTRY POINT
# Run with: python main.py
# Or:       uvicorn main:app --reload
# ─────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,       # Auto-restart on file changes during development
        log_level="info",
    )