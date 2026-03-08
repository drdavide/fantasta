// ─────────────────────────────────────────────
// src/context/AuctionContext.tsx
// Centralised state for the live auction room.
// Exposes state + dispatch only.
// The WS message handler lives in AuctionRoom.tsx
// and dispatches actions into this reducer.
// ─────────────────────────────────────────────
import React, {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
} from "react";

/* ═══════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════ */

export interface AuctionPlayer {
  id: string;
  name: string;
  team: string;
  real_team: string;
  role: "P" | "D" | "C" | "A";
  value: number;
  fvm: number;
  status: "available" | "sold";
  sold_price?: number;
}

export interface Bid {
  id?: string;
  team_id: string;
  team_name: string;
  player_id: string;
  amount: number;
  timestamp: string;
  username?: string;
}

export interface TeamBudget {
  id: string;
  name: string;
  budget: number;
  players_count: number;
}

export interface AuctionState {
  status: "idle" | "active" | "paused" | "completed";
  currentPlayer: AuctionPlayer | null;
  currentBid: Bid | null;
  bidHistory: Bid[];
  timeLeft: number;
  timerDuration: number;
  teams: TeamBudget[];
  lastEvent: string;
  message: string;
  /* ── Turn tracking ── */
  currentCallerId: string | null;
  /* ── WebSocket connection state ── */
  isConnected: boolean;
  error: string | null;
  currentAuctionId: string | null; 
}

/* ═══════════════════════════════════════════════
   ACTIONS
   ═══════════════════════════════════════════════ */

type Action =
  | { type: "SET_STATUS"; payload: AuctionState["status"] }
  | { type: "SET_PLAYER"; payload: { player: AuctionPlayer; startingBid: number; timerDuration: number } }
  | { type: "NEW_BID"; payload: Bid }
  | { type: "TIMER_TICK"; payload: number }
  | { type: "PLAYER_SOLD"; payload: { player_id: string; team_id: string; team_name: string; amount: number } }
  | { type: "PLAYER_UNSOLD"; payload: { player_id: string } }
  | { type: "SET_TEAMS"; payload: TeamBudget[] }
  | { type: "UPDATE_TEAM_BUDGET"; payload: { team_id: string; budget: number; players_count: number } }
  | { type: "SET_TURN"; payload: string | null }
  | { type: "SET_MESSAGE"; payload: string }
  | { type: "SET_CONNECTED"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "RESET" }
  | { type: "SET_AUCTION_ID"; payload: string | null };

/* ═══════════════════════════════════════════════
   INITIAL STATE
   ═══════════════════════════════════════════════ */

const initialState: AuctionState = {
  status: "idle",
  currentPlayer: null,
  currentBid: null,
  bidHistory: [],
  timeLeft: 0,
  timerDuration: 30,
  teams: [],
  lastEvent: "",
  message: "",
  currentCallerId: null,
  isConnected: false,
  error: null,
  currentAuctionId: localStorage.getItem("currentAuctionId"),
};

/* ═══════════════════════════════════════════════
   REDUCER
   ═══════════════════════════════════════════════ */

function reducer(state: AuctionState, action: Action): AuctionState {
  switch (action.type) {
    case "SET_STATUS":
      return {
        ...state,
        status: action.payload,
        lastEvent: `status:${action.payload}`,
      };

    case "SET_PLAYER":
      return {
        ...state,
        currentPlayer: action.payload.player,
        currentBid: null,
        bidHistory: [],
        timeLeft: action.payload.timerDuration,
        timerDuration: action.payload.timerDuration,
        lastEvent: "new_player",
        message: `Now auctioning: ${action.payload.player.name}`,
      };

    case "NEW_BID":
      return {
        ...state,
        currentBid: action.payload,
        bidHistory: [action.payload, ...state.bidHistory].slice(0, 50),
        timeLeft: state.timerDuration, // reset timer on new bid
        lastEvent: "new_bid",
        message: `${action.payload.team_name} bids ${action.payload.amount}`,
      };

    case "TIMER_TICK":
      return { ...state, timeLeft: action.payload };

    case "PLAYER_SOLD":
      return {
        ...state,
        currentPlayer: null,
        currentBid: null,
        timeLeft: 0,
        lastEvent: "sold",
        message: `SOLD! ${action.payload.team_name} wins for ${action.payload.amount} credits`,
      };

    case "PLAYER_UNSOLD":
      return {
        ...state,
        currentPlayer: null,
        currentBid: null,
        timeLeft: 0,
        lastEvent: "unsold",
        message: "Player went unsold — no bids received.",
      };

    case "SET_TEAMS":
      return { ...state, teams: action.payload };

    case "UPDATE_TEAM_BUDGET":
      return {
        ...state,
        teams: state.teams.map((t) =>
          t.id === action.payload.team_id
            ? {
                ...t,
                budget: action.payload.budget,
                players_count: action.payload.players_count,
              }
            : t
        ),
      };

    case "SET_TURN":
      return {
        ...state,
        currentCallerId: action.payload,
        lastEvent: "turn_changed",
      };

    case "SET_MESSAGE":
      return { ...state, message: action.payload };

    case "SET_CONNECTED":
      return { ...state, isConnected: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.payload };

    case "RESET":
      return { ...initialState };
    
    case "SET_AUCTION_ID":
      if (action.payload) {
        localStorage.setItem("currentAuctionId", action.payload);
      } else {
        localStorage.removeItem("currentAuctionId");
      }
      return { ...state, currentAuctionId: action.payload };

    default:
      return state;
  }
}

/* ═══════════════════════════════════════════════
   CONTEXT
   ═══════════════════════════════════════════════ */

interface AuctionContextType {
  state: AuctionState;
  dispatch: React.Dispatch<Action>;
}

const AuctionContext = createContext<AuctionContextType | undefined>(undefined);

/* ═══════════════════════════════════════════════
   PROVIDER
   ═══════════════════════════════════════════════ */

export const AuctionProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <AuctionContext.Provider value={{ state, dispatch }}>
      {children}
    </AuctionContext.Provider>
  );
};

/* ═══════════════════════════════════════════════
   HOOK
   ═══════════════════════════════════════════════ */

export const useAuction = () => {
  const ctx = useContext(AuctionContext);
  if (!ctx) {
    throw new Error("useAuction must be used within an AuctionProvider");
  }
  return ctx;
};