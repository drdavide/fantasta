// ============================================================
// FILE: src/pages/RecapPage.tsx
// ============================================================
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  getRecap,
  exportCsv,
  exportPdf,
  type AuctionRecap,
  type ManagerRecap,
  type Player,
} from "../services/api";

const ROLE_LABEL: Record<string, string> = {
  P: "GK",
  D: "DEF",
  C: "MID",
  A: "FWD",
};

const RecapPage: React.FC = () => {
  const { auctionId } = useParams<{ auctionId: string }>();

  const [recap, setRecap] = useState<AuctionRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  useEffect(() => {
    if (!auctionId) {
      setError("No auction ID found.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchRecap = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getRecap(auctionId);
        if (!cancelled) setRecap(data);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load recap.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRecap();
    return () => {
      cancelled = true;
    };
  }, [auctionId]);

  const handleExport = async (format: "csv" | "pdf") => {
    if (!auctionId) return;
    try {
      setExporting(format);
      if (format === "csv") await exportCsv(auctionId);
      else await exportPdf(auctionId);
    } catch {
      alert(`Export ${format.toUpperCase()} failed.`);
    } finally {
      setExporting(null);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading recap…</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-red-900/30 border border-red-700 rounded-xl px-6 py-5 max-w-md text-center">
          <p className="text-red-300 font-semibold text-lg mb-1">Error</p>
          <p className="text-red-200 text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Empty ──
  if (!recap) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-400">No auction data to recap.</p>
      </div>
    );
  }

  // ── Derived stats ──
  const allPlayers = recap.managers.flatMap((m) => [
    ...m.goalkeepers,
    ...m.defenders,
    ...m.midfielders,
    ...m.forwards,
  ]);

  const totalSpentAll = recap.managers.reduce((s, m) => s + m.budget_spent, 0);

  const mostExpensive = allPlayers
    .filter((p) => p.sold_price != null)
    .sort((a, b) => (b.sold_price ?? 0) - (a.sold_price ?? 0))[0] ?? null;

  const sortedManagers = [...recap.managers].sort(
    (a, b) => b.budget_spent - a.budget_spent
  );

  // Helper: all players for a manager, in display order
  const allRosterPlayers = (m: ManagerRecap): (Player & { _roleLabel: string })[] => [
    ...m.goalkeepers.map((p) => ({ ...p, _roleLabel: "GK" })),
    ...m.defenders.map((p) => ({ ...p, _roleLabel: "DEF" })),
    ...m.midfielders.map((p) => ({ ...p, _roleLabel: "MID" })),
    ...m.forwards.map((p) => ({ ...p, _roleLabel: "FWD" })),
  ];

  const maxBudget = recap.managers.length
    ? Math.max(...recap.managers.map((m) => m.budget_spent + m.budget_remaining))
    : 1;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-indigo-900/60 to-gray-800 rounded-2xl p-6 shadow-lg border border-indigo-700/40">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Auction Recap</h1>
            <p className="text-indigo-300 text-sm mt-1">{recap.auction_name}</p>
            {recap.completed_at && (
              <p className="text-gray-400 text-xs mt-1">
                Completed {new Date(recap.completed_at).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleExport("csv")}
              disabled={exporting !== null}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              {exporting === "csv" ? "Exporting…" : "Export CSV"}
            </button>
            <button
              onClick={() => handleExport("pdf")}
              disabled={exporting !== null}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              {exporting === "pdf" ? "Exporting…" : "Export PDF"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Managers</p>
          <p className="text-2xl font-bold text-white">{recap.total_managers}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Players Sold</p>
          <p className="text-2xl font-bold text-white">{recap.total_players_sold}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total Spent</p>
          <p className="text-2xl font-bold text-indigo-400">
            {totalSpentAll.toLocaleString()} cr
          </p>
        </div>
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Most Expensive</p>
          {mostExpensive ? (
            <div>
              <p className="text-lg font-bold text-white truncate">{mostExpensive.name}</p>
              <p className="text-indigo-300 text-sm">
                {mostExpensive.sold_price?.toLocaleString()} cr
              </p>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">N/A</p>
          )}
        </div>
      </div>

      {/* ── Manager standings ── */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Final Standings</h2>

        {sortedManagers.length > 0 ? (
          <div className="space-y-4">
            {sortedManagers.map((mgr, index) => {
              const medalColors: Record<number, string> = {
                0: "text-yellow-400",
                1: "text-gray-300",
                2: "text-amber-600",
              };
              const medalColor = medalColors[index] || "text-gray-500";
              const roster = allRosterPlayers(mgr);

              return (
                <div
                  key={mgr.manager_id}
                  className="bg-gray-800 rounded-xl border border-gray-700 p-5"
                >
                  {/* Manager header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className={`text-2xl font-bold ${medalColor} w-8 text-center`}>
                        #{index + 1}
                      </span>
                      <div>
                        <h3 className="text-white font-semibold text-base">{mgr.username}</h3>
                        <p className="text-gray-400 text-xs">
                          {roster.length} player{roster.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-indigo-400 font-bold text-lg">
                        {mgr.budget_spent.toLocaleString()} cr
                      </p>
                      <p className="text-gray-500 text-xs">total spent</p>
                    </div>
                  </div>

                  {/* Budget bar */}
                  <div className="w-full bg-gray-700 rounded-full h-2 mb-1">
                    <div
                      className="bg-indigo-500 h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min((mgr.budget_spent / maxBudget) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-gray-500 text-xs mb-4">
                    {Object.entries(mgr.slot_usage)
                      .map(([slot, usage]) => `${slot}: ${usage}`)
                      .join(" · ")}
                  </p>

                  {/* Roster table */}
                  {roster.length > 0 ? (
                    <div className="bg-gray-900/50 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-500 text-xs uppercase tracking-wide border-b border-gray-700">
                            <th className="text-left px-4 py-2">Player</th>
                            <th className="text-left px-4 py-2">Team</th>
                            <th className="text-left px-4 py-2">Role</th>
                            <th className="text-right px-4 py-2">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {roster.map((player) => (
                            <tr
                              key={player.id}
                              className="border-b border-gray-800 last:border-0"
                            >
                              <td className="px-4 py-2 text-white">{player.name}</td>
                              <td className="px-4 py-2 text-gray-400">{player.team}</td>
                              <td className="px-4 py-2 text-gray-400">{player._roleLabel}</td>
                              <td className="px-4 py-2 text-indigo-300 text-right font-medium">
                                {player.sold_price?.toLocaleString() ?? "—"} cr
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm italic">No players acquired.</p>
                  )}

                  {/* Footer stats */}
                  <div className="mt-3 flex justify-between text-xs text-gray-500">
                    <span>Budget remaining: {mgr.budget_remaining.toLocaleString()} cr</span>
                    <span>
                      Avg per player:{" "}
                      {roster.length
                        ? Math.round(mgr.budget_spent / roster.length).toLocaleString()
                        : "0"}{" "}
                      cr
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-gray-800/50 rounded-xl p-12 text-center border border-dashed border-gray-700">
            <p className="text-gray-500">No team data available for recap.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecapPage;