import asyncio
import random
from datetime import datetime
from typing import Optional, Dict, Callable, Awaitable, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func

from models import (
    Auction, Manager, Player, BidLog,
    AuctionStatus, PlayerStatus, PlayerRole, ROLE_LIMITS
)
from schemas import WSMessage, WSMessageType


# ─────────────────────────────────────────────
# CUSTOM EXCEPTIONS
#
# Each exception maps to a specific rule violation.
# Route handlers catch these and return the
# appropriate HTTP status code to the client.
# ─────────────────────────────────────────────

class AuctionEngineError(Exception):
    """Base exception for all auction engine errors."""
    pass


class NotYourTurnError(AuctionEngineError):
    """Raised when a manager tries to call a player when it's not their turn."""
    pass


class InvalidBidError(AuctionEngineError):
    """Raised when a bid is invalid (too low, same bidder, no active player, etc.)."""
    pass


class RosterFullError(AuctionEngineError):
    """Raised when a manager tries to bid on a role where their slot is already full."""
    pass


class InsufficientBudgetError(AuctionEngineError):
    """Raised when a manager does not have enough credits to place the bid."""
    pass


# ─────────────────────────────────────────────
# ACTIVE ENGINES REGISTRY
#
# A module-level dictionary that holds one
# AuctionEngine instance per auction_id.
#
# This allows the WebSocket manager and route
# handlers to always reference the SAME engine
# instance without passing it around everywhere.
#
# Key:   auction_id (str)
# Value: AuctionEngine instance
# ─────────────────────────────────────────────

active_engines: Dict[str, "AuctionEngine"] = {}


# ─────────────────────────────────────────────
# AUCTION ENGINE
#
# The core brain of the application.
# One instance is created per auction session
# and kept alive in active_engines while
# the auction is running.
# ─────────────────────────────────────────────

class AuctionEngine:
    """
    Manages all real-time auction logic for a single Fantacalcio auction session.

    Responsibilities:
    - Managing turn rotation (random, round-robin)
    - Validating player calls and bids
    - Running the countdown timer as an asyncio background task
    - Resolving player sales when the timer expires
    - Broadcasting WebSocket events to all connected clients
    - Persisting all state changes to the database

    Usage:
        engine = await get_or_create_engine(auction_id, db, broadcast_fn)
        await engine.start_auction()
    """

    def __init__(
        self,
        auction_id: str,
        db: AsyncSession,
        broadcast_callback: Callable[[str, WSMessage], Awaitable[None]]
    ) -> None:
        """
        Initialise the auction engine.

        Args:
            auction_id:         The UUID of the auction this engine manages.
            db:                 An async SQLAlchemy session for DB operations.
            broadcast_callback: An async function that sends a WSMessage to all
                                clients connected to a given auction_id.
                                Signature: async def broadcast(auction_id, message)
        """
        self.auction_id = auction_id
        self.db = db
        self.broadcast = broadcast_callback

        # ── Current bid state ──────────────────
        # These are reset after each player is sold.
        self.current_player_id: Optional[str] = None
        self.current_highest_bid: int = 0
        self.current_highest_bidder_id: Optional[str] = None

        # ── Timer state ────────────────────────
        # The asyncio Task running the countdown.
        # Stored so we can cancel it on pause/stop.
        self.timer_task: Optional[asyncio.Task] = None
        self.time_remaining: int = 15  # Will be updated from auction.timer_seconds

        # ── Turn tracking ──────────────────────
        # Ordered list of manager IDs in rotation.
        # Built when the auction starts.
        self.turn_rotation: List[str] = []
        self.current_turn_index: int = 0

    # ─────────────────────────────────────────
    # PUBLIC: START AUCTION
    # ─────────────────────────────────────────

    async def start_auction(self) -> None:
        """
        Start the auction session.

        Actions:
        1. Load all managers for this auction from the DB
        2. Shuffle their order randomly to determine calling rotation
        3. Persist the turn_order to each manager in the DB
        4. Set the auction status to 'active'
        5. Set the first caller
        6. Broadcast AUCTION_STATUS_CHANGED and TURN_CHANGED

        Raises:
            AuctionEngineError: If the auction has no managers or no players.
        """
        # Load the auction
        auction = await self._get_auction()

        # Load all non-admin managers (admins don't participate in the rotation)
        result = await self.db.execute(
            select(Manager).where(
                Manager.auction_id == self.auction_id,
                Manager.is_admin == False  # noqa: E712
            )
        )
        managers: List[Manager] = list(result.scalars().all())

        if not managers:
            raise AuctionEngineError(
                "Cannot start auction: no managers have been added yet."
            )

        # Load available players
        result = await self.db.execute(
            select(Player).where(
                Player.auction_id == self.auction_id,
                Player.status == PlayerStatus.available
            )
        )
        players = result.scalars().all()

        if not players:
            raise AuctionEngineError(
                "Cannot start auction: no players have been imported yet."
            )

        # Shuffle manager order randomly
        random.shuffle(managers)

        # Assign and persist turn_order (1-based index)
        self.turn_rotation = []
        for index, manager in enumerate(managers):
            manager.turn_order = index + 1
            self.turn_rotation.append(manager.id)

        # Set auction to active and record first caller
        auction.status = AuctionStatus.active
        auction.current_caller_id = self.turn_rotation[0]
        self.current_turn_index = 0
        self.time_remaining = auction.timer_seconds

        await self.db.commit()

        # Broadcast auction started
        await self.broadcast(
            self.auction_id,
            WSMessage(
                type=WSMessageType.AUCTION_STATUS_CHANGED,
                payload={
                    "status": AuctionStatus.active.value,
                    "message": "L'asta è iniziata!",
                }
            )
        )

        # Broadcast first caller
        first_caller = managers[0]
        await self.broadcast(
            self.auction_id,
            WSMessage(
                type=WSMessageType.TURN_CHANGED,
                payload={
                    "caller_id": first_caller.id,
                    "caller_username": first_caller.username,
                    "turn_order": 1,
                    "total_managers": len(managers),
                }
            )
        )

    # ─────────────────────────────────────────
    # PUBLIC: CALL PLAYER
    # ─────────────────────────────────────────

    async def call_player(self, manager_id: str, player_id: str) -> None:
        """
        A manager nominates a player to be auctioned.

        Validations:
        - It must be this manager's turn to call
        - The player must be available (not already sold)
        - The caller must have at least 1 credit remaining
        - The caller must have a free roster slot for the player's role

        After validation:
        - Sets the current player up for bidding
        - The caller automatically starts as the highest bidder at 1 credit
        - Starts the countdown timer
        - Broadcasts PLAYER_CALLED

        Args:
            manager_id: The ID of the manager calling the player.
            player_id:  The ID of the player being called.

        Raises:
            NotYourTurnError:       If it's not this manager's turn.
            InvalidBidError:        If there's already a player being bid on.
            AuctionEngineError:     If the player doesn't exist or isn't available.
            RosterFullError:        If the caller has no free slot for this role.
            InsufficientBudgetError: If the caller has 0 credits left.
        """
        auction = await self._get_auction()

        # Auction must be active
        if auction.status != AuctionStatus.active:
            raise AuctionEngineError(
                f"Cannot call a player — auction is currently '{auction.status.value}'."
            )

        # Cannot call while another player is being bid on
        if self.current_player_id is not None:
            raise InvalidBidError(
                "A player is already being auctioned. Wait for the current bid to resolve."
            )

        # Validate it's this manager's turn
        if (
            not self.turn_rotation or
            self.turn_rotation[self.current_turn_index] != manager_id
        ):
            raise NotYourTurnError(
                "It's not your turn to call a player."
            )

        # Load the player
        player = await self._get_player(player_id)

        if player.status != PlayerStatus.available:
            raise AuctionEngineError(
                f"Player '{player.name}' has already been sold."
            )

        # Load the calling manager
        manager = await self._get_manager(manager_id)

        # Check budget — must have at least 1 credit
        if manager.budget_remaining < 1:
            raise InsufficientBudgetError(
                f"{manager.username} has no credits left and cannot call a player."
            )

        # Check roster slot for this role
        current_count = await self._count_roster_by_role(manager_id, player.role)
        role_limit = ROLE_LIMITS[player.role]

        if current_count >= role_limit:
            raise RosterFullError(
                f"{manager.username} already has the maximum {role_limit} "
                f"player(s) in role {player.role.value}."
            )

        # ── Set bid state ──────────────────────
        # Caller starts as the highest bidder at 1 credit.
        # If nobody else bids, they win at 1.
        self.current_player_id = player_id
        self.current_highest_bid = 1
        self.current_highest_bidder_id = manager_id
        self.time_remaining = auction.timer_seconds

        # ── Start the countdown timer ──────────
        self._cancel_timer()
        self.timer_task = asyncio.create_task(self._run_timer())

        # ── Broadcast PLAYER_CALLED ────────────
        await self.broadcast(
            self.auction_id,
            WSMessage(
                type=WSMessageType.PLAYER_CALLED,
                payload={
                    "player_id": player.id,
                    "player_name": player.name,
                    "player_team": player.team,
                    "player_role": player.role.value,
                    "caller_id": manager_id,
                    "caller_username": manager.username,
                    "starting_price": 1,
                    "time_remaining": self.time_remaining,
                }
            )
        )

    # ─────────────────────────────────────────
    # PUBLIC: PLACE BID
    # ─────────────────────────────────────────

    async def place_bid(self, manager_id: str, amount: int) -> None:
        """
        A manager places a bid on the current player.

        Validations:
        - Auction must be active
        - A player must currently be up for auction
        - The bidder must not be the current highest bidder (no self-outbidding)
        - The bid amount must be strictly greater than the current highest bid
        - The manager must have enough budget to cover the bid
        - The manager must have a free roster slot for the player's role

        After validation:
        - Updates the current highest bid and bidder
        - Resets the countdown timer
        - Saves the bid to BidLog
        - Broadcasts BID_PLACED

        Args:
            manager_id: The ID of the manager placing the bid.
            amount:     The bid amount in fantamilioni (credits).

        Raises:
            InvalidBidError:         Various bid rule violations.
            InsufficientBudgetError: Manager can't afford the bid.
            RosterFullError:         Manager's role slot is full.
        """
        auction = await self._get_auction()

        # Must be active
        if auction.status != AuctionStatus.active:
            raise InvalidBidError(
                f"Cannot place a bid — auction is '{auction.status.value}'."
            )

        # Must have a player up for auction
        if self.current_player_id is None:
            raise InvalidBidError(
                "No player is currently being auctioned."
            )

        # Cannot outbid yourself
        if manager_id == self.current_highest_bidder_id:
            raise InvalidBidError(
                "You are already the highest bidder. You cannot outbid yourself."
            )

        # Bid must be strictly higher than current
        if amount <= self.current_highest_bid:
            raise InvalidBidError(
                f"Your bid of {amount} must be greater than the current "
                f"highest bid of {self.current_highest_bid}."
            )

        # Load manager
        manager = await self._get_manager(manager_id)

        # Check budget
        if amount > manager.budget_remaining:
            raise InsufficientBudgetError(
                f"{manager.username} only has {manager.budget_remaining} credits "
                f"remaining and cannot bid {amount}."
            )

        # Check roster slot
        player = await self._get_player(self.current_player_id)
        current_count = await self._count_roster_by_role(manager_id, player.role)
        role_limit = ROLE_LIMITS[player.role]

        if current_count >= role_limit:
            raise RosterFullError(
                f"{manager.username} already has the maximum {role_limit} "
                f"player(s) in role {player.role.value} and cannot bid on this player."
            )

        # ── Update bid state ───────────────────
        self.current_highest_bid = amount
        self.current_highest_bidder_id = manager_id

        # ── Reset the timer ────────────────────
        # Cancel the current countdown and start fresh.
        # This gives all managers another full timer window
        # to respond to the new bid.
        self.time_remaining = auction.timer_seconds
        self._cancel_timer()
        self.timer_task = asyncio.create_task(self._run_timer())

        # ── Save to BidLog ─────────────────────
        bid_entry = BidLog(
            auction_id=self.auction_id,
            player_id=self.current_player_id,
            manager_id=manager_id,
            amount=amount,
            timestamp=datetime.utcnow()
        )
        self.db.add(bid_entry)
        await self.db.commit()

        # ── Broadcast BID_PLACED ───────────────
        await self.broadcast(
            self.auction_id,
            WSMessage(
                type=WSMessageType.BID_PLACED,
                payload={
                    "player_id": player.id,
                    "player_name": player.name,
                    "player_role": player.role.value,
                    "manager_id": manager_id,
                    "manager_username": manager.username,
                    "amount": amount,
                    "time_remaining": self.time_remaining,
                }
            )
        )

    # ─────────────────────────────────────────
    # PUBLIC: PAUSE AUCTION
    # ─────────────────────────────────────────

    async def pause_auction(self) -> None:
        """
        Pause the auction (admin only).

        Cancels the running timer (if any) and sets
        the auction status to 'paused'. The current
        bid state is preserved so the auction can
        be resumed from where it left off.

        Broadcasts AUCTION_STATUS_CHANGED.
        """
        auction = await self._get_auction()

        if auction.status != AuctionStatus.active:
            raise AuctionEngineError(
                f"Cannot pause — auction is currently '{auction.status.value}'."
            )

        # Freeze the timer — time_remaining is preserved
        self._cancel_timer()

        auction.status = AuctionStatus.paused
        await self.db.commit()

        await self.broadcast(
            self.auction_id,
            WSMessage(
                type=WSMessageType.AUCTION_STATUS_CHANGED,
                payload={
                    "status": AuctionStatus.paused.value,
                    "message": "L'asta è in pausa.",
                    "time_remaining": self.time_remaining,
                }
            )
        )

    # ─────────────────────────────────────────
    # PUBLIC: RESUME AUCTION
    # ─────────────────────────────────────────

    async def resume_auction(self) -> None:
        """
        Resume a paused auction (admin only).

        Sets the auction status back to 'active'.
        If a player was being bid on when the auction
        was paused, the timer restarts from wherever
        time_remaining was frozen.

        Broadcasts AUCTION_STATUS_CHANGED.
        """
        auction = await self._get_auction()

        if auction.status != AuctionStatus.paused:
            raise AuctionEngineError(
                f"Cannot resume — auction is currently '{auction.status.value}'."
            )

        auction.status = AuctionStatus.active
        await self.db.commit()

        # Restart timer if a player is still in progress
        if self.current_player_id is not None:
            self._cancel_timer()
            self.timer_task = asyncio.create_task(self._run_timer())

        await self.broadcast(
            self.auction_id,
            WSMessage(
                type=WSMessageType.AUCTION_STATUS_CHANGED,
                payload={
                    "status": AuctionStatus.active.value,
                    "message": "L'asta è ripresa!",
                    "time_remaining": self.time_remaining,
                    "current_player_id": self.current_player_id,
                    "current_highest_bid": self.current_highest_bid,
                    "current_highest_bidder_id": self.current_highest_bidder_id,
                }
            )
        )

    # ─────────────────────────────────────────
    # PUBLIC: STOP AUCTION
    # ─────────────────────────────────────────

    async def stop_auction(self) -> None:
        """
        Permanently stop the auction (admin only).

        Cancels any running timer and sets the auction
        status to 'completed'. This cannot be undone.
        The engine is removed from active_engines.

        Broadcasts AUCTION_STATUS_CHANGED.
        """
        self._cancel_timer()

        auction = await self._get_auction()
        auction.status = AuctionStatus.completed
        await self.db.commit()

        await self.broadcast(
            self.auction_id,
            WSMessage(
                type=WSMessageType.AUCTION_STATUS_CHANGED,
                payload={
                    "status": AuctionStatus.completed.value,
                    "message": "L'asta è terminata.",
                }
            )
        )

        # Remove from registry — this engine is no longer needed
        active_engines.pop(self.auction_id, None)

    # ─────────────────────────────────────────
    # PRIVATE: RUN TIMER
    # ─────────────────────────────────────────

    async def _run_timer(self) -> None:
        """
        Run the bid countdown timer as an asyncio background task.

        How it works:
        - asyncio.sleep(1) suspends this coroutine for 1 second
          WITHOUT blocking the event loop. Other incoming requests
          (bids, connections, etc.) are processed normally while
          this coroutine sleeps.
        - Each second, we decrement time_remaining and broadcast
          a TIMER_UPDATE so the frontend can update the clock.
        - When time_remaining reaches 0, we call _resolve_sale().
        - If the task is cancelled (on bid reset, pause, or stop),
          asyncio.CancelledError is caught silently — no crash.
        """
        try:
            while self.time_remaining > 0:
                await asyncio.sleep(1)
                self.time_remaining -= 1

                # Broadcast the current countdown value every second
                await self.broadcast(
                    self.auction_id,
                    WSMessage(
                        type=WSMessageType.TIMER_UPDATE,
                        payload={
                            "time_remaining": self.time_remaining,
                            "player_id": self.current_player_id,
                            "current_highest_bid": self.current_highest_bid,
                            "current_highest_bidder_id": self.current_highest_bidder_id,
                        }
                    )
                )

            # Timer reached zero — resolve the sale
            await self._resolve_sale()

        except asyncio.CancelledError:
            # Timer was cancelled (bid placed, paused, or stopped).
            # This is expected behaviour — do nothing.
            pass

    # ─────────────────────────────────────────
    # PRIVATE: RESOLVE SALE
    # ─────────────────────────────────────────

    async def _resolve_sale(self) -> None:
        """
        Resolve the current player's sale when the timer expires.

        Actions:
        1. Mark the player as sold to the highest bidder
        2. Deduct the winning price from the winner's budget
        3. Save all changes to the database
        4. Broadcast PLAYER_SOLD
        5. Advance to the next caller in the rotation
        6. Check if the auction is complete (all rosters full)
        7. Broadcast TURN_CHANGED or AUCTION_STATUS_CHANGED (if complete)
        """
        if self.current_player_id is None or self.current_highest_bidder_id is None:
            # Nothing to resolve — safety guard
            return

        # Load current bid state into local vars before resetting
        player_id = self.current_player_id
        winning_bid = self.current_highest_bid
        winner_id = self.current_highest_bidder_id

        # Load player and winner from DB
        player = await self._get_player(player_id)
        winner = await self._get_manager(winner_id)

        # ── Mark player as sold ────────────────
        player.status = PlayerStatus.sold
        player.sold_to_id = winner_id
        player.sold_price = winning_bid

        # ── Deduct budget from winner ──────────
        winner.budget_remaining -= winning_bid

        await self.db.commit()

        # ── Broadcast PLAYER_SOLD ──────────────
        await self.broadcast(
            self.auction_id,
            WSMessage(
                type=WSMessageType.PLAYER_SOLD,
                payload={
                    "player_id": player.id,
                    "player_name": player.name,
                    "player_team": player.team,
                    "player_role": player.role.value,
                    "winner_id": winner_id,
                    "winner_username": winner.username,
                    "price": winning_bid,
                    "winner_budget_remaining": winner.budget_remaining,
                }
            )
        )

        # ── Reset bid state ────────────────────
        self.current_player_id = None
        self.current_highest_bid = 0
        self.current_highest_bidder_id = None

        # ── Advance turn ───────────────────────
        next_caller = await self._get_next_caller()

        if next_caller is None:
            # All managers have full rosters — auction complete
            await self.stop_auction()
            return

        # Update current caller in DB
        auction = await self._get_auction()
        auction.current_caller_id = next_caller.id
        await self.db.commit()

        # Broadcast next caller's turn
        await self.broadcast(
            self.auction_id,
            WSMessage(
                type=WSMessageType.TURN_CHANGED,
                payload={
                    "caller_id": next_caller.id,
                    "caller_username": next_caller.username,
                    "turn_index": self.current_turn_index + 1,
                    "total_managers": len(self.turn_rotation),
                }
            )
        )

    # ─────────────────────────────────────────
    # PRIVATE: GET NEXT CALLER
    # ─────────────────────────────────────────

    async def _get_next_caller(self) -> Optional[Manager]:
        """
        Advance to the next manager in the turn rotation.

        Cycles through turn_rotation in order, skipping any
        manager whose roster is already completely full (25 players).

        Returns:
            The next Manager who still has roster slots to fill,
            or None if all managers have full rosters (auction ends).
        """
        if not self.turn_rotation:
            return None

        total = len(self.turn_rotation)

        # Try each position in the rotation (max one full cycle)
        for _ in range(total):
            self.current_turn_index = (self.current_turn_index + 1) % total
            candidate_id = self.turn_rotation[self.current_turn_index]
            candidate = await self._get_manager(candidate_id)

            # Count total players in this manager's roster
            result = await self.db.execute(
                select(func.count(Player.id)).where(
                    Player.sold_to_id == candidate_id
                )
            )
            roster_count = result.scalar_one()

            # Total slots = sum of all role limits = 25
            total_slots = sum(ROLE_LIMITS.values())

            if roster_count < total_slots:
                return candidate

        # Every manager has a full roster
        return None

    # ─────────────────────────────────────────
    # PRIVATE: COUNT ROSTER BY ROLE
    # ─────────────────────────────────────────

    async def _count_roster_by_role(
        self,
        manager_id: str,
        role: PlayerRole
    ) -> int:
        """
        Count how many players of a specific role a manager already owns.

        Used to enforce the hard roster slot limits:
        P=3, D=8, C=8, A=6

        Args:
            manager_id: The manager to check.
            role:       The PlayerRole enum value (P, D, C, A).

        Returns:
            The number of players of that role in the manager's roster.
        """
        result = await self.db.execute(
            select(func.count(Player.id)).where(
                Player.sold_to_id == manager_id,
                Player.role == role
            )
        )
        return result.scalar_one()

    # ─────────────────────────────────────────
    # PRIVATE: CANCEL TIMER
    # ─────────────────────────────────────────

    def _cancel_timer(self) -> None:
        """
        Safely cancel the running asyncio timer task.

        Checks if a task exists and is not already done
        before calling cancel(). This prevents errors
        from trying to cancel a task that has already
        finished naturally.
        """
        if self.timer_task is not None and not self.timer_task.done():
            self.timer_task.cancel()
        self.timer_task = None

    # ─────────────────────────────────────────
    # PRIVATE: DB HELPERS
    #
    # Convenience methods to load entities from
    # the database with a clear error if not found.
    # Keeps the main methods clean and readable.
    # ─────────────────────────────────────────

    async def _get_auction(self) -> Auction:
        """Load the Auction from DB. Raises if not found."""
        result = await self.db.execute(
            select(Auction).where(Auction.id == self.auction_id)
        )
        auction = result.scalar_one_or_none()
        if auction is None:
            raise AuctionEngineError(
                f"Auction '{self.auction_id}' not found in the database."
            )
        return auction

    async def _get_manager(self, manager_id: str) -> Manager:
        """Load a Manager from DB by ID. Raises if not found."""
        result = await self.db.execute(
            select(Manager).where(Manager.id == manager_id)
        )
        manager = result.scalar_one_or_none()
        if manager is None:
            raise AuctionEngineError(
                f"Manager '{manager_id}' not found in the database."
            )
        return manager

    async def _get_player(self, player_id: str) -> Player:
        """Load a Player from DB by ID. Raises if not found."""
        result = await self.db.execute(
            select(Player).where(Player.id == player_id)
        )
        player = result.scalar_one_or_none()
        if player is None:
            raise AuctionEngineError(
                f"Player '{player_id}' not found in the database."
            )
        return player


# ─────────────────────────────────────────────
# FACTORY FUNCTION
#
# Always use this function to get an engine —
# never instantiate AuctionEngine directly.
#
# If an engine already exists for this auction_id
# (e.g. after a server restart or reconnection),
# the existing instance is returned unchanged.
# Otherwise, a new engine is created, registered,
# and returned.
# ─────────────────────────────────────────────

def get_or_create_engine(
    auction_id: str,
    db: AsyncSession,
    broadcast_callback: Callable[[str, WSMessage], Awaitable[None]]
) -> "AuctionEngine":
    """
    Retrieve an existing AuctionEngine or create a new one.

    This is the single entry point for accessing the engine.
    It ensures only one engine instance exists per auction,
    preventing duplicate timers or conflicting state.

    Args:
        auction_id:         The UUID of the auction.
        db:                 An async SQLAlchemy session.
        broadcast_callback: Async function to broadcast WS messages.

    Returns:
        The AuctionEngine instance for this auction_id.

    Usage:
        engine = get_or_create_engine(auction_id, db, broadcast_fn)
        await engine.start_auction()
    """
    if auction_id not in active_engines:
        active_engines[auction_id] = AuctionEngine(
            auction_id=auction_id,
            db=db,
            broadcast_callback=broadcast_callback
        )
    return active_engines[auction_id]
