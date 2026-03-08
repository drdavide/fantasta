// ============================================================
// FILE: pages/TeamsPage.tsx
// ============================================================
import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { getAuction } from "../services/api";
import type { Auction, Manager, Player } from "../services/api";
import { useAuth } from "../context/AuthContext";

const ROLE_LABELS: Record<string, string> = {
  P: "Portiere",
  D: "Difensore",
  C: "Centrocampista",
  A: "Attaccante",
};

const ROLE_COLORS: Record<string, string> = {
  P: "bg-yellow-600",
  D: "bg-green-600",
  C: "bg-blue-600",
  A: "bg-red-600",
};

const TeamsPage: React.FC = () => {
  // ✅ Use useAuth for auctionId, useParams as fallback
  const { user } = useAuth();
  const { auctionId: paramAuctionId } = useParams<{ auctionId: string }>();
  const auctionId = user?.auctionId || paramAuctionId || "";

  const [auction, setAuction] = useState<Auction | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedManagerId, setExpandedManagerId] = useState<string | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!auctionId) {
      setError("Nessun ID asta disponibile.");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await getAuction(auctionId);
      if (!signal?.aborted) {
        setAuction(data);
      }
    } catch (err: unknown) {
      if (!signal?.aborted) {
        setError(err instanceof Error ? err.message : "Errore nel caricamento.");
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [auctionId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const toggleExpand = (managerId: string) => {
    setExpandedManagerId((prev) => (prev === managerId ? null : managerId));
  };

  const getRoleCounts = (roster: Player[]): string => {
    const counts: Record<string, number> = { P: 0, D: 0, C: 0, A: 0 };
    roster.forEach((p) => {
      if (counts[p.role] !== undefined) {
        counts[p.role]++;
      }
    });
    return Object.entries(counts)
      .map(([role, count]) => `${count}${role}`)
      .join(", ");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Caricamento rose...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-red-900/30 border border-red-700 rounded-xl px-6 py-5 max-w-md text-center">
          <p className="text-red-300 font-semibold text-lg mb-1">Errore</p>
          <p className="text-red-200 text-sm">{error}</p>
          <button
            onClick={() => fetchData()}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
          >
            Riprova
          </button>
        </div>
      </div>
    );
  }

  const managers = auction?.managers || [];

  if (managers.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-6">Rose Squadre</h1>
        <div className="bg-gray-800/50 rounded-xl p-12 text-center border border-dashed border-gray-700">
          <div className="text-4xl mb-3">⚽</div>
          <p className="text-gray-400 text-lg">Nessuna squadra trovata</p>
          <p className="text-gray-500 text-sm mt-1">
            Le squadre appariranno qui quando i fantallenatori si uniranno.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Rose Squadre</h1>
        <span className="text-gray-400 text-sm">
          {managers.length} fantallenator{managers.length !== 1 ? "i" : "e"}
        </span>
      </div>

      <div className="space-y-4">
        {managers.map((manager: Manager) => {
          const isExpanded = expandedManagerId === manager.id;
          const roster = manager.roster || [];
          const budgetSpent = auction
            ? auction.budget_per_team - manager.budget_remaining
            : 0;
          const budgetPercent = auction
            ? Math.round(
                (manager.budget_remaining / auction.budget_per_team) * 100
              )
            : 0;

          return (
            <div
              key={manager.id}
              className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden transition-all"
            >
              <button
                onClick={() => toggleExpand(manager.id)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {manager.username?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-semibold text-base">
                        {manager.username}
                      </h3>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          manager.is_connected ? "bg-green-500" : "bg-gray-600"
                        }`}
                      />
                      {manager.is_admin && (
                        <span className="bg-amber-600/80 text-amber-100 text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {roster.length} giocator{roster.length !== 1 ? "i" : "e"}{" "}
                      — {getRoleCounts(roster)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right hidden sm:block">
                    <p className="text-green-400 font-semibold text-sm">
                      {manager.budget_remaining}
                    </p>
                    <p className="text-gray-500 text-xs">rimanenti</p>
                  </div>

                  <div className="w-20 hidden md:block">
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          budgetPercent > 50
                            ? "bg-green-500"
                            : budgetPercent > 20
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${budgetPercent}%` }}
                      />
                    </div>
                    <p className="text-gray-500 text-xs mt-1 text-center">
                      {budgetPercent}%
                    </p>
                  </div>

                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 border-t border-gray-700">
                  <div className="flex flex-wrap gap-4 mt-4 mb-4 text-sm">
                    <div>
                      <span className="text-gray-400">Budget speso: </span>
                      <span className="text-indigo-300 font-medium">
                        {budgetSpent}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Budget rimanente: </span>
                      <span className="text-green-400 font-medium">
                        {manager.budget_remaining}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Composizione: </span>
                      <span className="text-white font-medium">
                        {getRoleCounts(roster)}
                      </span>
                    </div>
                  </div>

                  {roster.length > 0 ? (
                    <div className="bg-gray-900/50 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-500 text-xs uppercase tracking-wide border-b border-gray-700">
                            <th className="text-left px-4 py-2">Giocatore</th>
                            <th className="text-left px-4 py-2">Squadra</th>
                            <th className="text-left px-4 py-2">Ruolo</th>
                            <th className="text-right px-4 py-2">Valore</th>
                            <th className="text-right px-4 py-2">Pagato</th>
                          </tr>
                        </thead>
                        <tbody>
                          {roster.map((player: Player) => (
                            <tr
                              key={player.id}
                              className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50"
                            >
                              <td className="px-4 py-2.5 text-white font-medium">
                                {player.name}
                              </td>
                              <td className="px-4 py-2.5 text-gray-400">
                                {player.team}
                              </td>
                              <td className="px-4 py-2.5">
                                <span
                                  className={`${
                                    ROLE_COLORS[player.role] || "bg-gray-600"
                                  } text-white text-[10px] font-semibold px-2 py-0.5 rounded-full`}
                                >
                                  {ROLE_LABELS[player.role] || player.role}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-gray-400 text-right">
                                {player.value}
                              </td>
                              <td className="px-4 py-2.5 text-indigo-300 text-right font-medium">
                                {player.sold_price ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm italic">
                      Rosa vuota — nessun giocatore acquistato.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TeamsPage;