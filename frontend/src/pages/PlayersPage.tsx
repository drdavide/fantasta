// src/pages/PlayersPage.tsx
import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../services/api";

interface Player {
  id: string;
  name: string;
  team: string;
  role: "P" | "D" | "C" | "A";
  value: number;
  status: "available" | "sold";
  sold_to_id: string | null;
  sold_price: number | null;
}

interface PlayersResponse {
  players: Player[];
  available_counts: Record<string, number>;
  sold_counts: Record<string, number>;
  total_available: number;
  total_sold: number;
}

const ROLES = ["All", "P", "D", "C", "A"] as const;
const ROLE_LABELS: Record<string, string> = {
  P: "Portiere",
  D: "Difensore",
  C: "Centrocampista",
  A: "Attaccante",
};
const STATUSES = ["All", "available", "sold"] as const;

export default function PlayersPage() {
  const { auctionId } = useParams<{ auctionId: string }>();
  const [data, setData] = useState<PlayersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  useEffect(() => {
    if (!auctionId) {
      setError("No auction ID found. Navigate from the auction page.");
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        const res: PlayersResponse = await apiFetch(
          `/auction/${auctionId}/players`
        );
        setData(res);
      } catch (err: any) {
        setError(err.message || "Failed to load players");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [auctionId]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.players.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.team.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === "All" || p.role === roleFilter;
      const matchesStatus = statusFilter === "All" || p.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [data, search, roleFilter, statusFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-lg">Loading players...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-400 text-lg">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Players Database</h1>

      {/* ── Summary badges ───────────────────────── */}
      {data && (
        <div className="flex flex-wrap gap-3 mb-6 text-sm">
          <span className="bg-gray-800 px-3 py-1 rounded-full text-gray-300">
            Total: {data.total_available + data.total_sold}
          </span>
          <span className="bg-emerald-500/20 px-3 py-1 rounded-full text-emerald-400">
            Available: {data.total_available}
          </span>
          <span className="bg-purple-500/20 px-3 py-1 rounded-full text-purple-400">
            Sold: {data.total_sold}
          </span>
          {Object.entries(data.available_counts).map(([role, count]) => (
            <span
              key={role}
              className="bg-gray-800 px-3 py-1 rounded-full text-gray-400"
            >
              {role}: {count} avail
            </span>
          ))}
        </div>
      )}

      {/* ── Filters ──────────────────────────────── */}
      <div className="flex flex-wrap gap-4 mb-6">
        <input
          type="text"
          placeholder="Search name or team..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2
                     text-white placeholder-gray-500 focus:outline-none
                     focus:ring-2 focus:ring-emerald-500 w-64"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2
                     text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r === "All" ? "All Roles" : `${r} — ${ROLE_LABELS[r]}`}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2
                     text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "All"
                ? "All Statuses"
                : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>

        <span className="self-center text-gray-400 ml-auto">
          {filtered.length} players shown
        </span>
      </div>

      {/* ── Table ────────────────────────────────── */}
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-center mt-12">No players found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <table className="w-full text-left">
            <thead className="bg-gray-800 text-gray-300 text-sm uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Sold Price</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-gray-800/50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-white">
                    {p.name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold
                      ${
                        p.role === "P"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : p.role === "D"
                          ? "bg-blue-500/20 text-blue-400"
                          : p.role === "C"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {p.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{p.team}</td>
                  <td className="px-4 py-3 text-gray-300">{p.value}</td>
                  <td className="px-4 py-3 text-gray-300">
                    {p.sold_price ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold
                      ${
                        p.status === "sold"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-gray-600/30 text-gray-400"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}