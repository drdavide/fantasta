import uuid
import enum
from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    String, Integer, Boolean, DateTime,
    ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


# ─────────────────────────────────────────────
# Python Enums
# These define the allowed values for status
# and role fields. Using Enums prevents typos
# and makes the code self-documenting.
# ─────────────────────────────────────────────

class AuctionStatus(str, enum.Enum):
    waiting   = "waiting"    # Auction created, not started yet
    active    = "active"     # Auction is running
    paused    = "paused"     # Admin paused the auction
    completed = "completed"  # Auction is over


class PlayerRole(str, enum.Enum):
    P = "P"  # Portiere   (Goalkeeper)
    D = "D"  # Difensore  (Defender)
    C = "C"  # Centrocampista (Midfielder)
    A = "A"  # Attaccante (Forward)


class PlayerStatus(str, enum.Enum):
    available = "available"  # Not yet sold
    sold      = "sold"       # Bought by a manager


# ─────────────────────────────────────────────
# Roster slot limits per role
# These constants define the hard limits
# enforced during the auction bidding.
# ─────────────────────────────────────────────

ROLE_LIMITS = {
    PlayerRole.P: 3,   # Max 3 goalkeepers
    PlayerRole.D: 8,   # Max 8 defenders
    PlayerRole.C: 8,   # Max 8 midfielders
    PlayerRole.A: 6,   # Max 6 forwards
}


# ─────────────────────────────────────────────
# Auction Model
# Represents a single auction session.
# There is only one auction at a time in this
# app — no league management, just the asta.
# ─────────────────────────────────────────────

class Auction(Base):
    __tablename__ = "auctions"

    # Primary key — UUID generated automatically
    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # Human-readable name for the auction session
    name: Mapped[str] = mapped_column(String, nullable=False)

    # Budget assigned to each manager at the start
    budget_per_team: Mapped[int] = mapped_column(Integer, nullable=False, default=500)

    # Countdown timer in seconds for each bid round
    # Admin can customise this, default is 15 seconds
    timer_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=15)

    # Current state of the auction
    status: Mapped[AuctionStatus] = mapped_column(
        SAEnum(AuctionStatus), nullable=False, default=AuctionStatus.waiting
    )

    # The manager whose turn it is to call a player
    # Nullable because no one is calling at the start
    current_caller_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("managers.id"), nullable=True
    )

    # Timestamp of when the auction was created
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    # ── Relationships ──────────────────────────
    # One auction has many managers
    managers: Mapped[List["Manager"]] = relationship(
        "Manager",
        back_populates="auction",
        foreign_keys="Manager.auction_id",
        cascade="all, delete-orphan"
    )

    # One auction has many players
    players: Mapped[List["Player"]] = relationship(
        "Player",
        back_populates="auction",
        cascade="all, delete-orphan"
    )

    # One auction has many bid log entries
    bids: Mapped[List["BidLog"]] = relationship(
        "BidLog",
        back_populates="auction",
        cascade="all, delete-orphan"
    )

    # The manager currently calling a player
    # Note: foreign_keys needed because Manager has two FKs to Auction
    current_caller: Mapped[Optional["Manager"]] = relationship(
        "Manager",
        foreign_keys=[current_caller_id],
        uselist=False
    )

    def __repr__(self) -> str:
        return f"<Auction name={self.name!r} status={self.status}>"


# ─────────────────────────────────────────────
# Manager Model
# Represents a participant in the auction.
# Created by the admin before the auction starts.
# ─────────────────────────────────────────────

class Manager(Base):
    __tablename__ = "managers"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # The auction this manager belongs to
    auction_id: Mapped[str] = mapped_column(
        String, ForeignKey("auctions.id"), nullable=False
    )

    # Login credentials
    username: Mapped[str] = mapped_column(String, nullable=False)

    # Password is stored hashed (bcrypt via passlib)
    # NEVER store plain text passwords
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)

    # Admin managers can start/pause/stop the auction
    # and import the player CSV
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Tracks how many credits the manager has left
    # Starts equal to auction.budget_per_team
    budget_remaining: Mapped[int] = mapped_column(Integer, nullable=False, default=500)

    # Position in the calling rotation (1, 2, 3...)
    # Assigned randomly when the auction starts
    # Nullable before the auction begins
    turn_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Tracks whether the manager is currently
    # connected via WebSocket to the auction room
    is_connected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # ── Relationships ──────────────────────────
    auction: Mapped["Auction"] = relationship(
        "Auction",
        back_populates="managers",
        foreign_keys=[auction_id]
    )

    # Players won by this manager
    roster: Mapped[List["Player"]] = relationship(
        "Player",
        back_populates="sold_to",
        foreign_keys="Player.sold_to_id"
    )

    # All bids placed by this manager
    bid_history: Mapped[List["BidLog"]] = relationship(
        "BidLog",
        back_populates="manager",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Manager username={self.username!r} admin={self.is_admin}>"


# ─────────────────────────────────────────────
# Player Model
# Represents a Serie A player in the auction pool.
# Loaded from the admin's CSV import.
# ─────────────────────────────────────────────

class Player(Base):
    __tablename__ = "players"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # The auction this player belongs to
    auction_id: Mapped[str] = mapped_column(
        String, ForeignKey("auctions.id"), nullable=False
    )

    # Player details from the CSV
    name: Mapped[str] = mapped_column(String, nullable=False)
    team: Mapped[str] = mapped_column(String, nullable=False)

    # Single role: P, D, C, or A
    role: Mapped[PlayerRole] = mapped_column(
        SAEnum(PlayerRole), nullable=False
    )

    # Estimated market value in fantamilioni (from CSV)
    # Optional — defaults to 0 if not provided in the CSV
    value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Whether the player has been sold or is still available
    status: Mapped[PlayerStatus] = mapped_column(
        SAEnum(PlayerStatus), nullable=False, default=PlayerStatus.available
    )

    # Set when the player is sold — points to the winning manager
    sold_to_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("managers.id"), nullable=True
    )

    # The final price paid for this player
    # Minimum is always 1 credit (starting price)
    sold_price: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # ── Relationships ──────────────────────────
    auction: Mapped["Auction"] = relationship(
        "Auction",
        back_populates="players"
    )

    sold_to: Mapped[Optional["Manager"]] = relationship(
        "Manager",
        back_populates="roster",
        foreign_keys=[sold_to_id]
    )

    # All bids placed on this player during the auction
    bids: Mapped[List["BidLog"]] = relationship(
        "BidLog",
        back_populates="player",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Player name={self.name!r} role={self.role} status={self.status}>"


# ─────────────────────────────────────────────
# BidLog Model
# Records every single bid placed during
# the auction. Used for transparency and for
# determining the winning bid when the timer expires.
# Also useful for the post-auction recap.
# ─────────────────────────────────────────────

class BidLog(Base):
    __tablename__ = "bid_logs"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # Every bid belongs to a specific auction
    auction_id: Mapped[str] = mapped_column(
        String, ForeignKey("auctions.id"), nullable=False
    )

    # The player being bid on
    player_id: Mapped[str] = mapped_column(
        String, ForeignKey("players.id"), nullable=False
    )

    # The manager who placed the bid
    manager_id: Mapped[str] = mapped_column(
        String, ForeignKey("managers.id"), nullable=False
    )

    # The bid amount in fantamilioni (credits)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)

    # Exact time the bid was placed
    # Useful for resolving simultaneous bids
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    # ── Relationships ──────────────────────────
    auction: Mapped["Auction"] = relationship(
        "Auction",
        back_populates="bids"
    )

    player: Mapped["Player"] = relationship(
        "Player",
        back_populates="bids"
    )

    manager: Mapped["Manager"] = relationship(
        "Manager",
        back_populates="bid_history"
    )

    def __repr__(self) -> str:
        return f"<BidLog player_id={self.player_id!r} manager_id={self.manager_id!r} amount={self.amount}>"
    