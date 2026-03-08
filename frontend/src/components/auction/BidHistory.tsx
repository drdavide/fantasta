import { useAuction } from "../../context/AuctionContext";

export default function BidHistory() {
  const { state } = useAuction();
  const { bidHistory } = state;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Bid History</h3>

      <div className="max-h-64 overflow-y-auto space-y-1 scrollbar-thin">
        {bidHistory.length === 0 && (
          <p className="text-gray-600 text-sm py-4 text-center">No bids yet</p>
        )}
        {bidHistory.map((bid, i) => (
          <div
            key={bid.id ?? i}
            className={`flex items-center justify-between py-2 px-3 rounded text-sm ${
              i === 0 ? "bg-emerald-900/30 border border-emerald-700/40" : "bg-gray-800/40"
            }`}
          >
            <div className="flex items-center gap-2">
              {i === 0 && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
              <span className="font-medium">{bid.team_name}</span>
              {bid.username && <span className="text-gray-500">({bid.username})</span>}
            </div>
            <span className={`font-mono font-bold ${i === 0 ? "text-emerald-400" : "text-gray-400"}`}>
              {bid.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}