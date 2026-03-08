import { useAuction } from "../../context/AuctionContext";

export default function TeamBudgets() {
  const { state } = useAuction();
  const { teams, currentBid } = state;

  const sorted = [...teams].sort((a, b) => b.budget - a.budget);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Team Budgets</h3>

      <div className="space-y-1">
        {sorted.map((team) => {
          const isLeading = currentBid?.team_id === team.id;
          return (
            <div
              key={team.id}
              className={`flex items-center justify-between py-2 px-3 rounded text-sm ${
                isLeading ? "bg-emerald-900/30 border border-emerald-700/40" : "bg-gray-800/40"
              }`}
            >
              <div className="flex items-center gap-2">
                {isLeading && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                <span className="font-medium truncate max-w-32">{team.name}</span>
                <span className="text-gray-600 text-xs">({team.players_count}p)</span>
              </div>
              <span className="font-mono font-bold text-emerald-400">{team.budget}</span>
            </div>
          );
        })}
        {teams.length === 0 && (
          <p className="text-gray-600 text-sm text-center py-4">No teams loaded</p>
        )}
      </div>
    </div>
  );
}