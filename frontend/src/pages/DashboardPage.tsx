// ============================================================
// FILE: src/pages/DashboardPage.tsx
// ============================================================
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getAuction } from "../services/api";
import type { Auction } from "../services/api";
import { useAuth } from "../context/AuthContext";

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const auctionId = user?.auctionId || localStorage.getItem("currentAuctionId") || "";

  const [auction, setAuction] = useState<Auction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      if (!auctionId) {
        setError("Nessun ID asta trovato. Crea o unisciti a un'asta.");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const data = await getAuction(auctionId);
        if (!signal?.aborted) setAuction(data);
      } catch (err: unknown) {
        if (!signal?.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Errore nel caricamento dell'asta."
          );
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [auctionId]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const statusConfig: Record<string, { label: string; bgClass: string }> = {
    waiting: { label: "In Attesa", bgClass: "bg-blue-600" },
    active: { label: "Attiva", bgClass: "bg-green-600" },
    paused: { label: "In Pausa", bgClass: "bg-yellow-600" },
    completed: { label: "Completata", bgClass: "bg-gray-600" },
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Caricamento dashboard…</p>
        </div>
      </div>
    );
  }

  // ── Error ──
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

  // ── Empty ──
  if (!auction) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-400">Nessun dato disponibile.</p>
      </div>
    );
  }

  const status = statusConfig[auction.status] || {
    label: auction.status,
    bgClass: "bg-gray-600",
  };

  const formattedDate = auction.created_at
    ? new Date(auction.created_at).toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "N/A";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* ── Auction header ── */}
      <div className="bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{auction.name}</h1>
            <p className="text-gray-400 text-sm mt-1">
              Creata il {formattedDate}
            </p>
            <p className="text-gray-500 text-xs font-mono mt-0.5">
              ID: {auction.id}
            </p>
          </div>
          <span
            className={`${status.bgClass} text-white text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wide self-start`}
          >
            {status.label}
          </span>
        </div>
      </div>

      {/* ── Quick nav buttons ── */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => navigate(`/auction/${auction.id}`)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
        >
          Entra nell'Asta
        </button>
        <button
          onClick={() => navigate(`/auction/${auction.id}/players`)}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
        >
          Giocatori
        </button>
        <button
          onClick={() => navigate(`/auction/${auction.id}/teams`)}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
        >
          Squadre
        </button>
        {auction.status === "completed" && (
          <button
            onClick={() => navigate(`/auction/${auction.id}/recap`)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
          >
            Riepilogo
          </button>
        )}
      </div>

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">
            Budget per Squadra
          </p>
          <p className="text-3xl font-bold text-indigo-400">
            {auction.budget_per_team}
          </p>
        </div>
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">
            Timer (secondi)
          </p>
          <p className="text-3xl font-bold text-white">
            {auction.timer_seconds}s
          </p>
        </div>
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">
            Fantallenatori
          </p>
          <p className="text-3xl font-bold text-white">
            {auction.managers?.length || 0}
          </p>
        </div>
      </div>

      {/* ── Manager cards ── */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">
          Fantallenatori
        </h2>

        {auction.managers && auction.managers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {auction.managers.map((manager) => {
              const isCaller = auction.current_caller_id === manager.id;
              const budgetUsed =
                auction.budget_per_team - manager.budget_remaining;
              const budgetPercent =
                auction.budget_per_team > 0
                  ? Math.round(
                      (manager.budget_remaining / auction.budget_per_team) * 100
                    )
                  : 0;

              return (
                <div
                  key={manager.id}
                  className={`bg-gray-800 rounded-xl p-4 border transition-colors ${
                    isCaller
                      ? "border-indigo-500 ring-2 ring-indigo-500/30"
                      : "border-gray-700 hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          manager.is_connected ? "bg-green-500" : "bg-gray-600"
                        }`}
                        title={
                          manager.is_connected ? "Connesso" : "Disconnesso"
                        }
                      />
                      <h3 className="text-white font-semibold text-base truncate">
                        {manager.username}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {manager.is_admin && (
                        <span className="bg-amber-600/80 text-amber-100 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase">
                          Admin
                        </span>
                      )}
                      {isCaller && (
                        <span className="bg-indigo-600 text-indigo-100 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase">
                          Turno
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Budget</span>
                      <span className="text-white font-medium">
                        {manager.budget_remaining}
                        <span className="text-gray-500">
                          {" "}/ {auction.budget_per_team}
                        </span>
                      </span>
                    </div>
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
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Spesi</span>
                      <span className="text-indigo-300 font-medium">
                        {budgetUsed}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Rosa</span>
                      <span className="text-white font-medium">
                        {manager.roster?.length || 0} giocatori
                      </span>
                    </div>
                    {manager.turn_order != null && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Ordine turno</span>
                        <span className="text-gray-300 font-medium">
                          #{manager.turn_order}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-gray-800/50 rounded-xl p-8 text-center border border-dashed border-gray-700">
            <p className="text-gray-500">
              Nessun fantallenatore si è ancora unito.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;