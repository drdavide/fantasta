import { useState } from "react";
import { useAuction } from "../../context/AuctionContext";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../services/api";

export default function BidPanel() {
  const { state } = useAuction();
  const { user } = useAuth();
  const { currentPlayer, currentBid, status, teams } = state;

  const [customAmount, setCustomAmount] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Find the user's team
  const myTeam = teams.find((t) => t.name && t.id); // TODO: match by owner_id if available

  const minBid = currentBid ? currentBid.amount + 1 : (currentPlayer?.fvm ?? 1);

  const quickBids = [
    minBid,
    minBid + 1,
    minBid + 2,
    minBid + 5,
    minBid + 10,
  ];

  const placeBid = async (amount: number) => {
    if (!currentPlayer) return;
    setError("");
    setSubmitting(true);
    try {
      await apiFetch("/auction/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: currentPlayer.id,
          amount,
        }),
      });
      setCustomAmount("");
    } catch (err: any) {
      setError(err.message || "Bid failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCustomBid = () => {
    const amount = parseInt(customAmount);
    if (isNaN(amount) || amount < minBid) {
      setError(`Minimum bid is ${minBid}`);
      return;
    }
    placeBid(amount);
  };

  if (!currentPlayer || status !== "active") {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-500">Bidding</h3>
        <p className="text-gray-600 text-sm mt-2">
          {status === "paused" ? "Auction is paused — bidding disabled." : "No active auction. Wait for a player to be nominated."}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Place Your Bid</h3>
        <span className="text-xs text-gray-500">Min: {minBid}</span>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Quick bid buttons */}
      <div className="grid grid-cols-5 gap-2">
        {quickBids.map((amount) => (
          <button
            key={amount}
            onClick={() => placeBid(amount)}
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 py-3 rounded-lg font-bold text-lg transition-colors disabled:opacity-40"
          >
            {amount}
          </button>
        ))}
      </div>

      {/* Custom bid */}
      <div className="flex gap-2">
        <input
          type="number"
          placeholder={`Custom (min ${minBid})`}
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCustomBid()}
          min={minBid}
          className="flex-1 px-4 py-2 rounded bg-gray-800 border border-gray-700 focus:border-emerald-500 focus:outline-none font-mono"
        />
        <button
          onClick={handleCustomBid}
          disabled={submitting || !customAmount}
          className="bg-emerald-600 hover:bg-emerald-700 px-6 py-2 rounded font-semibold transition-colors disabled:opacity-40"
        >
          Bid
        </button>
      </div>
    </div>
  );
}