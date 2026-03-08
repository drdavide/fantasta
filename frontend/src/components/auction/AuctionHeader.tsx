import { useAuction } from "../../context/AuctionContext";

const statusStyles: Record<string, string> = {
  idle: "bg-gray-700 text-gray-300",
  active: "bg-emerald-600 text-white",
  paused: "bg-yellow-600 text-gray-900",
  completed: "bg-blue-600 text-white",
};

export default function AuctionHeader() {
  const { state } = useAuction();
  const { status, message } = state;

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold">Live Auction</h1>
        {message && <p className="text-gray-400 text-sm mt-1">{message}</p>}
      </div>
      <span className={`px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide ${statusStyles[status] || statusStyles.idle}`}>
        {status}
      </span>
    </div>
  );
}