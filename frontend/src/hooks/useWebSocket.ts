// ─────────────────────────────────────────────
// src/hooks/useWebSocket.ts
// Manages the WebSocket connection to the
// live auction room. Handles connect, disconnect,
// reconnect, and message sending.
// ─────────────────────────────────────────────
import { useEffect, useRef, useCallback } from "react";
import { getToken,} from "../services/api";
import type { WSMessage } from "../services/api"
import { useAuction } from "../context/AuctionContext";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const WS_BASE_URL =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

// ─────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────

interface UseWebSocketReturn {
  sendMessage: (message: object) => void;
  isConnected: boolean;
  disconnect: () => void;
}

/**
 * Manages a WebSocket connection to the auction room.
 *
 * @param auctionId     - The auction room to connect to
 * @param onMessage     - Handler for incoming messages (lives in AuctionRoom.tsx)
 */
export function useWebSocket(
  auctionId: string | null,
  onMessage: (msg: WSMessage) => void
): UseWebSocketReturn {
  const { state, dispatch } = useAuction();

  // Stable ref for the message handler so the WebSocket
  // onmessage callback always calls the latest version
  // without needing to tear down and reconnect.
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalDisconnectRef = useRef(false);

  // ── Connect function ───────────────────────
  const connect = useCallback(() => {
    const token = getToken();
    if (!auctionId || !token) {
      console.warn("[WebSocket] Cannot connect — missing auctionId or token");
      return;
    }

    // Close any existing connection before opening a new one
    if (wsRef.current) {
      wsRef.current.close();
    }

    const url = `${WS_BASE_URL}/${auctionId}?token=${token}`;
    console.log(`[WebSocket] Connecting to ${url}`);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    // ── onopen ────────────────────────────────
    ws.onopen = () => {
      console.log("[WebSocket] Connected ✓");
      reconnectAttemptsRef.current = 0;
      dispatch({ type: "SET_CONNECTED", payload: true });
      dispatch({ type: "SET_ERROR", payload: null });
    };

    // ── onmessage ─────────────────────────────
    ws.onmessage = (event: MessageEvent) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        onMessageRef.current(message);
      } catch (err) {
        console.error("[WebSocket] Failed to parse message:", event.data, err);
      }
    };

    // ── onerror ───────────────────────────────
    ws.onerror = (event) => {
      console.error("[WebSocket] Error:", event);
      dispatch({
        type: "SET_ERROR",
        payload: "Connessione WebSocket interrotta. Riconnessione in corso...",
      });
    };

    // ── onclose ───────────────────────────────
    ws.onclose = (event) => {
      console.log(
        `[WebSocket] Closed — code: ${event.code}, reason: ${event.reason}`
      );
      dispatch({ type: "SET_CONNECTED", payload: false });

      if (intentionalDisconnectRef.current) {
        console.log("[WebSocket] Intentional disconnect — not reconnecting");
        return;
      }

      // Auth errors from the server — don't reconnect
      if (event.code === 4001 || event.code === 4002 || event.code === 4003) {
        console.error(
          "[WebSocket] Auth error — not reconnecting:",
          event.reason
        );
        dispatch({
          type: "SET_ERROR",
          payload: event.reason || "Errore di autenticazione.",
        });
        return;
      }

      // Reconnect with linear backoff
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        const delay = RECONNECT_DELAY_MS * reconnectAttemptsRef.current;
        console.log(
          `[WebSocket] Reconnecting in ${delay}ms ` +
            `(attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
        );
        dispatch({
          type: "SET_ERROR",
          payload: `Connessione persa. Riconnessione ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}...`,
        });
        reconnectTimerRef.current = setTimeout(() => connect(), delay);
      } else {
        console.error("[WebSocket] Max reconnect attempts reached");
        dispatch({
          type: "SET_ERROR",
          payload: "Impossibile riconnettersi. Ricarica la pagina.",
        });
      }
    };
  }, [auctionId, dispatch]);

  // ── Auto-connect when auctionId is available ──
  useEffect(() => {
    if (!auctionId) return;

    intentionalDisconnectRef.current = false;
    connect();

    return () => {
      intentionalDisconnectRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      dispatch({ type: "SET_CONNECTED", payload: false });
    };
  }, [auctionId, connect]);

  // ── Send message ───────────────────────────
  const sendMessage = useCallback((message: object) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn("[WebSocket] Cannot send — connection not open");
      return;
    }
    try {
      wsRef.current.send(JSON.stringify(message));
    } catch (err) {
      console.error("[WebSocket] Failed to send message:", err);
    }
  }, []);

  // ── Manual disconnect ──────────────────────
  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    dispatch({ type: "SET_CONNECTED", payload: false });
  }, [dispatch]);

  return {
    sendMessage,
    isConnected: state.isConnected,
    disconnect,
  };
}