import { useAuction } from "../../context/AuctionContext";
import TimerBar from "./TimerBar";

const roleBadge: Record<string, { label: string; color: string }> = {
  P: { label: "GK", color: "bg-yellow-500/20 text-yellow-400" },
  D: { label: "DEF", color: "bg-blue-500/20 text-blue-400" },
  C: { label: "MID", color: "bg-emerald-500/20 text-emerald-400" },
  A: { label: "FWD", color: "bg-red-500/20 text-red-400" },
};

export default function CurrentPlayer() {
  const { state } = useAuction();
  const { currentPlayer, currentBid, status, message, lastEvent } = state;

  // Idle / no player
  if (!currentPlayer) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-3">
        {lastEvent === "sold" || lastEvent === "unsold" ? (
          <>
            <p className={`text-xl font-bold ${lastEvent === "sold" ? "text-emerald-400" : "text-gray-400"}`}>
              {message}
            </p>
            <p className="text-gray-500 text-sm">Waiting for the next player to be nominated…</p>
          </>
        ) : (
          <>
            <p className="text-2xl font-bold text-gray-500">
              {status === "idle" ? "Auction hasn't started yet" :
               status === "paused" ? "Auction is paused" :
               status === "completed" ? "Auction is over!" :
               "Waiting for a player to be nominated…"}
            </p>
            {status === "idle" && (
              <p className="text-gray-600 text-sm">The admin will start the auction soon.</p>
            )}
          </>
        )}
      </div>
    );
  }

  const badge = roleBadge[currentPlayer.role] || { label: currentPlayer.role, color: "bg-gray-700 text-gray-300" };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
      {/* Player info */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className={`text-xs font-bold px-2 py-1 rounded ${badge.color}`}>{badge.label}</span>
            <span className="text-gray-500 text-sm">{currentPlayer.real_team}</span>
          </div>
          <h2 className="text-3xl font-bold">{currentPlayer.name}</h2>
          <p className="text-gray-400 text-sm mt-1">
            FVM: <span className="text-white font-semibold">{currentPlayer.fvm}</span>
          </p>
        </div>

        {/* Current bid highlight */}
        <div className="text-right">
          <p className="text-gray-400 text-xs uppercase tracking-wide">Current Bid</p>
          <p className="text-4xl font-black text-emerald-400">
            {currentBid ? currentBid.amount : "—"}
          </p>
          {currentBid && (
            <p className="text-sm text-gray-400 mt-1">
              by <span className="text-white font-medium">{currentBid.team_name}</span>
            </p>
          )}
        </div>
      </div>

      {/* Timer */}
      <TimerBar />
    </div>
  );
}