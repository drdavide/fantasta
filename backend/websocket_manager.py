import json
from typing import Dict, List, Optional

from fastapi import WebSocket, WebSocketDisconnect, Query
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import Manager, AuctionStatus
from schemas import WSMessage, WSMessageType
from auth import SECRET_KEY, ALGORITHM
from auction_engine import (
    get_or_create_engine,
    active_engines,
    AuctionEngineError,
    NotYourTurnError,
    InvalidBidError,
    RosterFullError,
    InsufficientBudgetError,
)


# ─────────────────────────────────────────────
# CONNECTION MANAGER
#
# The ConnectionManager is the central hub for
# all active WebSocket connections.
#
# It keeps two registries:
#
# 1. connections: groups WebSocket objects by
#    auction_id so we can broadcast to everyone
#    in a specific auction room.
#
# 2. manager_connections: maps a manager_id to
#    their WebSocket so we can send a private
#    message to a specific manager.
#
# One singleton instance is created at the bottom
# of this file and shared across the entire app.
# ─────────────────────────────────────────────

class ConnectionManager:
    """
    Manages all active WebSocket connections for the Fantacalcio auction app.

    Responsibilities:
    - Registering and unregistering connections
    - Broadcasting messages to all clients in an auction room
    - Sending private messages to individual clients
    - Routing incoming client messages to the AuctionEngine
    - Handling disconnections and errors gracefully
    """

    def __init__(self) -> None:
        # auction_id -> list of active WebSocket connections
        # Multiple managers can be connected to the same auction
        self.connections: Dict[str, List[WebSocket]] = {}

        # manager_id -> their WebSocket connection
        # Used for sending private/personal messages
        self.manager_connections: Dict[str, WebSocket] = {}

    # ─────────────────────────────────────────
    # CONNECT
    # Called when a new WebSocket connection is
    # accepted. Registers the connection and
    # notifies everyone else in the room.
    # ─────────────────────────────────────────

    async def connect(
        self,
        websocket: WebSocket,
        auction_id: str,
        manager_id: str,
        manager_username: str,
        db: AsyncSession
    ) -> None:
        """
        Accept and register a new WebSocket connection.

        WebSocket lifecycle:
        1. Client initiates a WS connection (ws://server/ws/auction_id?token=...)
        2. Server calls websocket.accept() to complete the handshake
        3. The connection stays open until either side closes it

        After accepting:
        - The WebSocket is added to the auction's connection list
        - The manager is mapped for direct messaging
        - The manager's is_connected flag is set to True in the DB
        - A MANAGER_CONNECTED event is broadcast to all other clients

        Args:
            websocket:         The incoming WebSocket connection.
            auction_id:        The auction room to join.
            manager_id:        The authenticated manager's ID.
            manager_username:  The manager's display name (for broadcast payload).
            db:                Async DB session.
        """
        # Complete the WebSocket handshake
        await websocket.accept()

        # Add to auction room registry
        if auction_id not in self.connections:
            self.connections[auction_id] = []
        self.connections[auction_id].append(websocket)

        # Map manager_id -> websocket for direct messaging
        self.manager_connections[manager_id] = websocket

        # Mark manager as connected in the database
        result = await db.execute(
            select(Manager).where(Manager.id == manager_id)
        )
        manager = result.scalar_one_or_none()
        if manager:
            manager.is_connected = True
            await db.commit()

        # Notify all other connected clients in this auction
        await self.broadcast(
            auction_id,
            WSMessage(
                type=WSMessageType.MANAGER_CONNECTED,
                payload={
                    "manager_id": manager_id,
                    "manager_username": manager_username,
                    "connected_count": self.get_connected_count(auction_id),
                }
            ),
            exclude_websocket=websocket  # Don't echo back to the connector
        )

    # ─────────────────────────────────────────
    # DISCONNECT
    # Called when a WebSocket connection closes,
    # either cleanly or due to an error.
    # ─────────────────────────────────────────

    async def disconnect(
        self,
        websocket: WebSocket,
        auction_id: str,
        manager_id: str,
        manager_username: str,
        db: AsyncSession
    ) -> None:
        """
        Unregister a closed WebSocket connection.

        Called automatically when:
        - The client closes their browser tab
        - The network drops
        - A WebSocketDisconnect exception is raised

        Actions:
        - Remove WebSocket from both registries
        - Mark manager as disconnected in the DB
        - Broadcast MANAGER_DISCONNECTED to remaining clients

        Args:
            websocket:         The WebSocket that is closing.
            auction_id:        The auction room to leave.
            manager_id:        The manager who is disconnecting.
            manager_username:  The manager's display name.
            db:                Async DB session.
        """
        # Remove from auction room registry
        if auction_id in self.connections:
            try:
                self.connections[auction_id].remove(websocket)
            except ValueError:
                pass  # Already removed — safe to ignore

            # Clean up empty rooms
            if not self.connections[auction_id]:
                del self.connections[auction_id]

        # Remove from direct message registry
        self.manager_connections.pop(manager_id, None)

        # Mark manager as disconnected in the database
        try:
            result = await db.execute(
                select(Manager).where(Manager.id == manager_id)
            )
            manager = result.scalar_one_or_none()
            if manager:
                manager.is_connected = False
                await db.commit()
        except Exception:
            # DB might be unavailable — don't crash on disconnect
            pass

        # Notify remaining clients in the auction room
        await self.broadcast(
            auction_id,
            WSMessage(
                type=WSMessageType.MANAGER_DISCONNECTED,
                payload={
                    "manager_id": manager_id,
                    "manager_username": manager_username,
                    "connected_count": self.get_connected_count(auction_id),
                }
            )
        )

    # ─────────────────────────────────────────
    # BROADCAST
    # Send a message to ALL connected clients
    # in a specific auction room.
    # ─────────────────────────────────────────

    async def broadcast(
        self,
        auction_id: str,
        message: WSMessage,
        exclude_websocket: Optional[WebSocket] = None
    ) -> None:
        """
        Send a WSMessage to all WebSocket connections in an auction room.

        The message is serialized to JSON before sending.
        If a send fails (e.g. the connection dropped without a clean close),
        the dead connection is silently removed from the registry — no crash.

        Args:
            auction_id:         The auction room to broadcast to.
            message:            The WSMessage to send.
            exclude_websocket:  Optional — skip this specific connection
                                (used to avoid echoing back to the sender).
        """
        if auction_id not in self.connections:
            return  # No one connected — nothing to do

        # Serialize once, send many times
        message_json = message.model_dump_json()

        # Collect dead connections to remove after iteration
        # (never modify a list while iterating over it)
        dead_connections: List[WebSocket] = []

        for websocket in self.connections[auction_id]:
            if websocket is exclude_websocket:
                continue

            try:
                await websocket.send_text(message_json)
            except Exception:
                # Connection is dead — mark for cleanup
                dead_connections.append(websocket)

        # Clean up any dead connections found during broadcast
        for dead in dead_connections:
            try:
                self.connections[auction_id].remove(dead)
            except ValueError:
                pass

    # ─────────────────────────────────────────
    # SEND PERSONAL
    # Send a message to ONE specific manager.
    # Used for error responses and private info.
    # ─────────────────────────────────────────

    async def send_personal(
        self,
        manager_id: str,
        message: WSMessage
    ) -> None:
        """
        Send a WSMessage to a single manager's WebSocket.

        Used for:
        - Sending error messages back to the sender
        - Sending auction state on reconnect
        - Any message that should only go to one manager

        Args:
            manager_id: The target manager's ID.
            message:    The WSMessage to send.
        """
        websocket = self.manager_connections.get(manager_id)
        if websocket is None:
            return  # Manager is not connected — nothing to do

        try:
            await websocket.send_text(message.model_dump_json())
        except Exception:
            # Connection dropped — remove from registries silently
            self.manager_connections.pop(manager_id, None)

    # ─────────────────────────────────────────
    # HANDLE MESSAGE
    # Parse and route an incoming client message
    # to the correct AuctionEngine method.
    # ─────────────────────────────────────────

    async def handle_message(
        self,
        websocket: WebSocket,
        auction_id: str,
        manager_id: str,
        manager: Manager,
        raw_message: str,
        db: AsyncSession
    ) -> None:
        """
        Parse a raw JSON string from the client and route it to the engine.

        Message routing:
        - CALL_PLAYER             → engine.call_player()
        - BID_PLACED              → engine.place_bid()
        - AUCTION_STATUS_CHANGED  → engine.start/pause/resume/stop (admin only)
        - Unknown type            → ERROR sent back to sender

        All AuctionEngineError subclasses are caught here and turned into
        ERROR WebSocket messages sent back to the offending client.
        The server never crashes due to a bad client message.

        Args:
            websocket:   The WebSocket that sent the message.
            auction_id:  The auction room context.
            manager_id:  The authenticated manager who sent the message.
            manager:     The Manager ORM object (has is_admin, username, etc.).
            raw_message: The raw JSON string received from the client.
            db:          Async DB session.
        """

        # ── Step 1: Parse JSON ─────────────────
        try:
            data = json.loads(raw_message)
            message_type = data.get("type")
            payload = data.get("payload", {})
        except (json.JSONDecodeError, ValueError):
            await self.send_personal(
                manager_id,
                WSMessage(
                    type=WSMessageType.ERROR,
                    payload={"message": "Invalid message format. Expected JSON."}
                )
            )
            return

        # ── Step 2: Get or create the engine ──
        # The broadcast callback is a closure that
        # captures the connection_manager instance.
        async def broadcast_fn(aid: str, msg: WSMessage) -> None:
            await self.broadcast(aid, msg)

        engine = get_or_create_engine(
            auction_id=auction_id,
            db=db,
            broadcast_callback=broadcast_fn
        )

        # ── Step 3: Route to engine method ────
        try:
            # ── CALL_PLAYER ───────────────────
            if message_type == WSMessageType.PLAYER_CALLED:
                player_id = payload.get("player_id")
                if not player_id:
                    raise InvalidBidError("Missing 'player_id' in payload.")
                await engine.call_player(
                    manager_id=manager_id,
                    player_id=player_id
                )

            # ── BID_PLACED ────────────────────
            elif message_type == WSMessageType.BID_PLACED:
                amount = payload.get("amount")
                if amount is None:
                    raise InvalidBidError("Missing 'amount' in payload.")
                if not isinstance(amount, int) or amount < 1:
                    raise InvalidBidError("Bid amount must be a positive integer.")
                await engine.place_bid(
                    manager_id=manager_id,
                    amount=amount
                )

            # ── AUCTION_STATUS_CHANGED ────────
            # Admin-only control messages.
            # Action can be: "start", "pause", "resume", "stop"
            elif message_type == WSMessageType.AUCTION_STATUS_CHANGED:
                if not manager.is_admin:
                    await self.send_personal(
                        manager_id,
                        WSMessage(
                            type=WSMessageType.ERROR,
                            payload={
                                "message": "Only admins can control the auction status."
                            }
                        )
                    )
                    return

                action = payload.get("action", "").lower()

                if action == "start":
                    await engine.start_auction()
                elif action == "pause":
                    await engine.pause_auction()
                elif action == "resume":
                    await engine.resume_auction()
                elif action == "stop":
                    await engine.stop_auction()
                else:
                    raise AuctionEngineError(
                        f"Unknown auction action '{action}'. "
                        f"Valid actions are: start, pause, resume, stop."
                    )

            # ── UNKNOWN MESSAGE TYPE ──────────
            else:
                await self.send_personal(
                    manager_id,
                    WSMessage(
                        type=WSMessageType.ERROR,
                        payload={
                            "message": (
                                f"Unknown message type '{message_type}'. "
                                f"Valid types: PLAYER_CALLED, BID_PLACED, "
                                f"AUCTION_STATUS_CHANGED."
                            )
                        }
                    )
                )

        # ── Step 4: Handle engine errors ──────
        # Each specific exception type gives the
        # client a clear, actionable error message.
        except NotYourTurnError as error:
            await self.send_personal(
                manager_id,
                WSMessage(
                    type=WSMessageType.ERROR,
                    payload={"message": str(error), "code": "NOT_YOUR_TURN"}
                )
            )
        except RosterFullError as error:
            await self.send_personal(
                manager_id,
                WSMessage(
                    type=WSMessageType.ERROR,
                    payload={"message": str(error), "code": "ROSTER_FULL"}
                )
            )
        except InsufficientBudgetError as error:
            await self.send_personal(
                manager_id,
                WSMessage(
                    type=WSMessageType.ERROR,
                    payload={"message": str(error), "code": "INSUFFICIENT_BUDGET"}
                )
            )
        except InvalidBidError as error:
            await self.send_personal(
                manager_id,
                WSMessage(
                    type=WSMessageType.ERROR,
                    payload={"message": str(error), "code": "INVALID_BID"}
                )
            )
        except AuctionEngineError as error:
            await self.send_personal(
                manager_id,
                WSMessage(
                    type=WSMessageType.ERROR,
                    payload={"message": str(error), "code": "AUCTION_ERROR"}
                )
            )
        except Exception as error:
            # Unexpected errors — log and send a generic message
            print(f"[WebSocket] Unexpected error for manager {manager_id}: {error}")
            await self.send_personal(
                manager_id,
                WSMessage(
                    type=WSMessageType.ERROR,
                    payload={
                        "message": "An unexpected server error occurred.",
                        "code": "SERVER_ERROR"
                    }
                )
            )

    # ─────────────────────────────────────────
    # GET CONNECTED COUNT
    # Returns how many clients are currently
    # connected to a specific auction room.
    # ─────────────────────────────────────────

    def get_connected_count(self, auction_id: str) -> int:
        """
        Return the number of active WebSocket connections for an auction.

        Useful for showing online presence indicators in the UI
        (e.g. "5 of 8 managers connected").

        Args:
            auction_id: The auction room to count connections for.

        Returns:
            Number of active connections (0 if auction room doesn't exist).
        """
        return len(self.connections.get(auction_id, []))


# ─────────────────────────────────────────────
# MODULE-LEVEL SINGLETON
#
# One ConnectionManager instance shared across
# the entire application. Imported by main.py
# to register the WebSocket route.
# ─────────────────────────────────────────────

connection_manager = ConnectionManager()


# ─────────────────────────────────────────────
# WEBSOCKET ENDPOINT
#
# This is the FastAPI route handler for the
# WebSocket connection.
#
# URL: ws://localhost:8000/ws/{auction_id}?token=<jwt>
#
# The JWT token is passed as a query parameter
# because browser WebSocket APIs don't support
# custom headers — query params are the standard
# workaround for WS authentication.
# ─────────────────────────────────────────────

async def auction_websocket(
    websocket: WebSocket,
    auction_id: str,
    token: str = Query(..., description="JWT access token for authentication"),
    db: AsyncSession = None
) -> None:
    """
    FastAPI WebSocket route handler for the live auction room.

    Full connection lifecycle:
    1. Client connects: ws://server/ws/{auction_id}?token=<jwt>
    2. Server validates the JWT and loads the manager from DB
    3. Server accepts the connection and registers it
    4. Server enters the receive loop — waiting for client messages
    5. Each message is parsed and routed to the AuctionEngine
    6. On disconnect (clean or error): connection is unregistered

    Args:
        websocket:  The incoming WebSocket connection (injected by FastAPI).
        auction_id: Path parameter — which auction room to join.
        token:      Query parameter — JWT for authentication.
        db:         Async DB session (injected via Depends in main.py).
    """
    manager_id: Optional[str] = None
    manager_username: str = "Unknown"
    manager: Optional[Manager] = None

    # ── Step 1: Validate JWT token ─────────────
    # We can't use the standard Depends(get_current_manager)
    # here because WebSocket routes don't support HTTP headers.
    # Instead we manually decode the token from the query param.
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        manager_id = payload.get("manager_id")
        manager_username = payload.get("username", "Unknown")

        if not manager_id:
            await websocket.close(code=4001, reason="Invalid token: missing manager_id.")
            return

    except JWTError:
        await websocket.close(code=4001, reason="Invalid or expired token.")
        return

    # ── Step 2: Load manager from DB ───────────
    try:
        result = await db.execute(
            select(Manager).where(Manager.id == manager_id)
        )
        manager = result.scalar_one_or_none()

        if manager is None:
            await websocket.close(code=4002, reason="Manager not found.")
            return

        # Confirm manager belongs to this auction
        if manager.auction_id != auction_id:
            await websocket.close(
                code=4003,
                reason="You do not belong to this auction."
            )
            return

    except Exception as error:
        print(f"[WebSocket] DB error during connection setup: {error}")
        await websocket.close(code=4500, reason="Server error during authentication.")
        return

    # ── Step 3: Register the connection ────────
    await connection_manager.connect(
        websocket=websocket,
        auction_id=auction_id,
        manager_id=manager_id,
        manager_username=manager_username,
        db=db
    )

    # ── Step 4: Send current auction state ─────
    # When a manager joins (or rejoins after a drop),
    # send them the current auction snapshot so their
    # UI is immediately in sync.
    try:
        auction_result = await db.execute(
            select(Manager).where(Manager.auction_id == auction_id)
        )
        engine = active_engines.get(auction_id)

        await connection_manager.send_personal(
            manager_id,
            WSMessage(
                type=WSMessageType.AUCTION_STATUS_CHANGED,
                payload={
                    "status": "reconnect_sync",
                    "current_player_id": engine.current_player_id if engine else None,
                    "current_highest_bid": engine.current_highest_bid if engine else 0,
                    "current_highest_bidder_id": engine.current_highest_bidder_id if engine else None,
                    "time_remaining": engine.time_remaining if engine else 0,
                    "connected_count": connection_manager.get_connected_count(auction_id),
                    "message": f"Benvenuto, {manager_username}!",
                }
            )
        )
    except Exception as error:
        print(f"[WebSocket] Could not send sync state to {manager_username}: {error}")

    # ── Step 5: Receive loop ────────────────────
    # This loop keeps the connection alive.
    # It blocks on websocket.receive_text() until
    # the client sends a message or disconnects.
    # WebSocketDisconnect is raised automatically
    # when the connection closes.
    try:
        while True:
            raw_message = await websocket.receive_text()

            await connection_manager.handle_message(
                websocket=websocket,
                auction_id=auction_id,
                manager_id=manager_id,
                manager=manager,
                raw_message=raw_message,
                db=db
            )

    except WebSocketDisconnect:
        # Client disconnected cleanly (browser closed, navigated away, etc.)
        pass

    except Exception as error:
        # Unexpected error in the receive loop
        print(f"[WebSocket] Connection error for {manager_username}: {error}")

    finally:
        # ── Step 6: Always clean up ─────────────
        # This block runs whether the disconnect was
        # clean, due to an error, or due to the server
        # shutting down. The connection is always
        # properly unregistered.
        await connection_manager.disconnect(
            websocket=websocket,
            auction_id=auction_id,
            manager_id=manager_id,
            manager_username=manager_username,
            db=db
        )