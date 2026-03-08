import { useState, useEffect } from "react";
import { apiFetch } from "../../services/api";

export default function AuctionControls() {
  const [status, setStatus] = useState("idle");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const data = await apiFetch<{ auction_status?: string }>("/league/settings");
      setStatus(data.auction_status || "idle");
    } catch {}
  };

  const sendAction = async (action: string) => {
    setLoading(true);
    setMessage("");
    try {
      const data = await apiFetch<{ message?: string }>(`/auction/${action}`, { method: "POST" });
      setMessage(data.message || `Action "${action}" successful`);
      loadStatus();
    } catch (err: any) {
      setMessage("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("⚠️ This will reset the entire auction. All bids and assignments will be lost. Continue?")) return;
    sendAction("reset");
  };

  const statusColor: Record<string, string> = {
    idle: "text-gray-400",
    active: "text-emerald-400",
    paused: "text-yellow-400",
    completed: "text-blue-400",
  };

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="text-xl font-semibold">Auction Controls</h2>

      <div className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
        <span className="text-gray-400">Current Status</span>
        <span className={`text-lg font-bold uppercase ${statusColor[status] || "text-white"}`}>
          {status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => sendAction("start")}
          disabled={loading || status === "active"}
          className="bg-emerald-600 hover:bg-emerald-700 py-3 rounded font-semibold transition-colors disabled:opacity-40"
        >
          ▶ Start Auction
        </button>
        <button
          onClick={() => sendAction("pause")}
          disabled={loading || status !== "active"}
          className="bg-yellow-600 hover:bg-yellow-700 py-3 rounded font-semibold transition-colors disabled:opacity-40"
        >
          ⏸ Pause
        </button>
        <button
          onClick={() => sendAction("resume")}
          disabled={loading || status !== "paused"}
          className="bg-blue-600 hover:bg-blue-700 py-3 rounded font-semibold transition-colors disabled:opacity-40"
        >
          ⏵ Resume
        </button>
        <button
          onClick={handleReset}
          disabled={loading}
          className="bg-red-600 hover:bg-red-700 py-3 rounded font-semibold transition-colors disabled:opacity-40"
        >
          ⟲ Reset Auction
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
          {message}
        </p>
      )}

      <p className="text-xs text-gray-600">
        Starting the auction enables bidding for all connected users. Pausing freezes all timers.
        Resetting clears all bids and player assignments — use with caution.
      </p>
    </div>
  );
}