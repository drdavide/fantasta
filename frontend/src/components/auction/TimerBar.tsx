import { useAuction } from "../../context/AuctionContext";

export default function TimerBar() {
  const { state } = useAuction();
  const { timeLeft, timerDuration, currentPlayer } = state;

  if (!currentPlayer) return null;

  const pct = timerDuration > 0 ? (timeLeft / timerDuration) * 100 : 0;

  const barColor =
    pct > 50 ? "bg-emerald-500" :
    pct > 20 ? "bg-yellow-500" :
    "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-400">Time remaining</span>
        <span className={`font-mono font-bold ${pct <= 20 ? "text-red-400 animate-pulse" : "text-white"}`}>
          {timeLeft}s
        </span>
      </div>
      <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}