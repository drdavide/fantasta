import { useState, useEffect } from "react";
import { apiFetch } from "../../services/api";
import { useAuth } from "../../context/AuthContext";

interface Player {
  id: number;
  name: string;
  role: string;
  real_team: string;
  fvm: number;
}

export default function NominatePlayer() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [filtered, setFiltered] = useState<Player[]>([]);
  const [nominating, setNominating] = useState(false);
  const [message, setMessage] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  // Only render for admins
  if (user?.role !== "admin") return null;

  useEffect(() => {
    loadAvailablePlayers();
  }, []);

  useEffect(() => {
    let result = players;
    if (roleFilter !== "ALL") {
      result = result.filter((p) => p.role === roleFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.real_team.toLowerCase().includes(q)
      );
    }
    setFiltered(result.slice(0, 20));
  }, [search, roleFilter, players]);

  const loadAvailablePlayers = async () => {
    try {
      const data = await apiFetch("/players?available=true");
      setPlayers(Array.isArray(data) ? data : data.players || []);
    } catch {
      setMessage("Failed to load players");
    }
  };

  const nominate = async (playerId: number) => {
    setNominating(true);
    setMessage("");
    try {
      await apiFetch("/auction/nominate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: playerId }),
      });
      setMessage("Player nominated!");
      setSearch("");
      loadAvailablePlayers(); // refresh list
    } catch (err: any) {
      setMessage("Error: " + err.message);
    } finally {
      setNominating(false);
    }
  };

  const handleRandomNominate = async () => {
    setNominating(true);
    setMessage("");
    try {
      await apiFetch("/auction/nominate/random", { method: "POST" });
      setMessage("Random player nominated!");
      loadAvailablePlayers();
    } catch (err: any) {
      setMessage("Error: " + err.message);
    } finally {
      setNominating(false);
    }
  };

  const roleOptions = ["ALL", "P", "D", "C", "A"];
  const roleLabels: Record<string, string> = { ALL: "All", P: "GK", D: "DEF", C: "MID", A: "FWD" };

  return (
    <div className="bg-gray-900 border border-yellow-800/40 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-yellow-400 uppercase tracking-wide">
          Nominate Player (Admin)
        </h3>
        <button
          onClick={handleRandomNominate}
          disabled={nominating}
          className="text-xs bg-yellow-600 hover:bg-yellow-700 text-gray-900 font-semibold px-3 py-1 rounded transition-colors disabled:opacity-40"
        >
          🎲 Random
        </button>
      </div>

      {message && <p className="text-sm text-emerald-400">{message}</p>}

      {/* Filters */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search by name or team…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 rounded bg-gray-800 border border-gray-700 focus:border-yellow-500 focus:outline-none text-sm"
        />
        <div className="flex gap-1">
          {roleOptions.map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-2 py-1 text-xs rounded font-semibold transition-colors ${
                roleFilter === r ? "bg-yellow-500 text-gray-900" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {roleLabels[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Player list */}
      <div className="max-h-48 overflow-y-auto space-y-1">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between py-2 px-3 rounded bg-gray-800/50 hover:bg-gray-800 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-6">{p.role}</span>
              <span className="font-medium">{p.name}</span>
              <span className="text-gray-500">{p.real_team}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-gray-400 font-mono text-xs">FVM {p.fvm}</span>
              <button
                onClick={() => nominate(p.id)}
                disabled={nominating}
                className="text-yellow-400 hover:text-yellow-300 font-semibold text-xs transition-colors disabled:opacity-40"
              >
                Nominate
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-gray-600 text-sm text-center py-3">No available players found</p>
        )}
      </div>
    </div>
  );
}