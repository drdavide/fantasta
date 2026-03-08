import { useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { AuctionProvider, useAuction } from "../context/AuctionContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { apiFetch, WSMessageType, type WSMessage} from "../services/api";
import type { AuctionPlayer } from "../context/AuctionContext";
import AuctionHeader from "../components/auction/AuctionHeader";
import CurrentPlayer from "../components/auction/CurrentPlayer";
import BidPanel from "../components/auction/BidPanel";
import BidHistory from "../components/auction/BidHistory";
import TeamBudgets from "../components/auction/TeamBudgets";
import NominatePlayer from "../components/auction/NominatePlayer";

function AuctionRoomInner() {
  const { state, dispatch } = useAuction();
  const { auctionId } = useParams<{ auctionId: string }>();

  /* ── Persist auctionId for Navbar fallback ───────────────────── */
  useEffect(() => {
    if (auctionId) {
      localStorage.setItem("currentAuctionId", auctionId);
    }
  }, [auctionId]);

  /* ── WebSocket handler ───────────────────────────────────────── */
  const handleWSMessage = useCallback(
    (msg: WSMessage) => {
      const data: Record<string, any> = { ...msg, ...msg.payload };

      switch (data.type) {
        // ── SYNC ──────────────────────────────────────────────────
        case WSMessageType.SYNC: {
          if (data.status) {
            dispatch({ type: "SET_STATUS", payload: data.status });
          }
          if (data.teams) {
            dispatch({ type: "SET_TEAMS", payload: data.teams });
          }
          if (data.current_player) {
            dispatch({
              type: "SET_PLAYER",
              payload: {
                player: data.current_player,
                startingBid: data.starting_bid ?? 1,
                timerDuration: data.timer_duration ?? 30,
              },
            });
          }
          if (data.current_bid) {
            dispatch({ type: "NEW_BID", payload: data.current_bid });
          }
          if (data.current_caller_id) {
            dispatch({ type: "SET_TURN", payload: data.current_caller_id });
          }
          break;
        }

        // ── PLAYER_CALLED ─────────────────────────────────────────
        case WSMessageType.PLAYER_CALLED: {
          dispatch({
            type: "SET_PLAYER",
            payload: {
              player: data.player,
              startingBid: data.starting_bid ?? 1,
              timerDuration: data.timer_duration ?? 30,
            },
          });
          break;
        }

        // ── BID_PLACED ────────────────────────────────────────────
        case WSMessageType.BID_PLACED: {
          dispatch({
            type: "NEW_BID",
            payload: {
              team_id: data.manager_id,
              team_name: data.manager_username ?? "",
              player_id: data.player_id,
              amount: data.amount,
              timestamp: msg.timestamp ?? new Date().toISOString(),
            },
          });
          break;
        }

        // ── TIMER_UPDATE ──────────────────────────────────────────
        case WSMessageType.TIMER_UPDATE: {
          dispatch({ type: "TIMER_TICK", payload: data.time_remaining });
          break;
        }

        // ── PLAYER_SOLD ───────────────────────────────────────────
        case WSMessageType.PLAYER_SOLD: {
          dispatch({
            type: "PLAYER_SOLD",
            payload: {
              player_id: data.player_id,
              team_id: data.manager_id ?? data.team_id,
              team_name: data.manager_username ?? data.team_name ?? "",
              amount: data.amount,
            },
          });
          if (data.budget !== undefined && data.players_count !== undefined) {
            dispatch({
              type: "UPDATE_TEAM_BUDGET",
              payload: {
                team_id: data.manager_id ?? data.team_id,
                budget: data.budget,
                players_count: data.players_count,
              },
            });
          }
          break;
        }

        // ── AUCTION_STATUS_CHANGED ────────────────────────────────
        case WSMessageType.AUCTION_STATUS_CHANGED: {
          const status = data.status;
          if (status === "reconnect_sync") {
            if (data.current_highest_bid) {
              dispatch({
                type: "NEW_BID",
                payload: {
                  team_id: data.current_highest_bidder_id,
                  team_name: "",
                  player_id: data.current_player_id,
                  amount: data.current_highest_bid,
                  timestamp: new Date().toISOString(),
                },
              });
            }
            if (data.time_remaining !== undefined) {
              dispatch({ type: "TIMER_TICK", payload: data.time_remaining });
            }
          } else if (
            status === "active" ||
            status === "paused" ||
            status === "completed"
          ) {
            dispatch({ type: "SET_STATUS", payload: status });
          }
          if (data.message) {
            dispatch({ type: "SET_MESSAGE", payload: data.message });
          }
          break;
        }

        // ── TURN_CHANGED ──────────────────────────────────────────
        case WSMessageType.TURN_CHANGED: {
          dispatch({
            type: "SET_TURN",
            payload: data.manager_id ?? null,
          });
          if (data.message) {
            dispatch({ type: "SET_MESSAGE", payload: data.message });
          }
          break;
        }

        // ── MANAGER_CONNECTED ─────────────────────────────────────
        case WSMessageType.MANAGER_CONNECTED: {
          dispatch({
            type: "SET_MESSAGE",
            payload:
              data.message ?? `${data.manager_username ?? "Someone"} joined`,
          });
          break;
        }

        // ── MANAGER_DISCONNECTED ──────────────────────────────────
        case WSMessageType.MANAGER_DISCONNECTED: {
          dispatch({
            type: "SET_MESSAGE",
            payload:
              data.message ?? `${data.manager_username ?? "Someone"} left`,
          });
          break;
        }

        // ── ERROR ─────────────────────────────────────────────────
        case WSMessageType.ERROR: {
          console.error("[WS] Server error:", data.message);
          dispatch({
            type: "SET_ERROR",
            payload: data.message ?? "Server error",
          });
          break;
        }

        // ── FALLBACK ──────────────────────────────────────────────
        default:
          console.warn(
            "[AuctionRoom] Unhandled WS message type:",
            msg.type
          );
      }
    },
    [dispatch]
  );

  /* ── WebSocket connection ────────────────────────────────────── */
  const { sendMessage: _sendMessage, isConnected: _isConnected, disconnect: _disconnect } = useWebSocket(
    auctionId ?? null,
    handleWSMessage
  );

// OR simpler — just don't destructure at all:
useWebSocket(auctionId ?? null, handleWSMessage);

  /* ── Load initial data via REST ──────────────────────────────── */
  useEffect(() => {
    const loadInitial = async () => {
      try {
        const teams = await apiFetch<
          Array<{ id: string; name: string; budget: number; players_count?: number }>
        >("/teams");
        dispatch({
          type: "SET_TEAMS",
          payload: teams.map((t) => ({
            id: t.id,
            name: t.name,
            budget: t.budget,
            players_count: t.players_count ?? 0,
          })),
        });
      } catch {}

      try {
        const settings = await apiFetch<{ auction_status?: string }>(
          "/league/settings"
        );
        const status = settings.auction_status || "idle";
        dispatch({
          type: "SET_STATUS",
          payload: status as "idle" | "active" | "paused" | "completed",
        });
      } catch {}

      try {
        const current = await apiFetch<{
          player?: AuctionPlayer;
          starting_bid?: number;
          timer_duration?: number;
          current_bid?: {
            team_id: string;
            team_name: string;
            player_id: string;
            amount: number;
            timestamp: string;
          };
          time_left?: number;
        }>("/auction/current");

        if (current && current.player) {
          dispatch({
            type: "SET_PLAYER",
            payload: {
              player: current.player,
              startingBid: current.starting_bid ?? 1,
              timerDuration: current.timer_duration ?? 30,
            },
          });
          if (current.current_bid) {
            dispatch({ type: "NEW_BID", payload: current.current_bid });
          }
          if (current.time_left !== undefined) {
            dispatch({ type: "TIMER_TICK", payload: current.time_left });
          }
        }
      } catch {
        // No active auction — that's fine
      }
    };
    loadInitial();
  }, [dispatch]);

  /* ── Layout ──────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      <AuctionHeader />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <CurrentPlayer />
          <BidPanel />
          <NominatePlayer />
        </div>
        <div className="space-y-4">
          <TeamBudgets />
          <BidHistory />
        </div>
      </div>
    </div>
  );
}

export default function AuctionRoom() {
  return (
    <AuctionProvider>
      <AuctionRoomInner />
    </AuctionProvider>
  );
}