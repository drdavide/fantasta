import { useState, useEffect } from "react";
import { apiFetch } from "../../services/api";

interface Team {
  id: number;
  name: string;
  owner_id: number | null;
  budget: number;
}

interface User {
  id: number;
  username: string;
  role: string;
}

export default function TeamManager() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [newName, setNewName] = useState("");
  const [newOwnerId, setNewOwnerId] = useState<number | "">("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadTeams();
    loadUsers();
  }, []);

  const loadTeams = async () => {
    try {
      const data = await apiFetch("/teams");
      setTeams(data);
    } catch (err: any) {
      setMessage("Failed to load teams");
    }
  };

  const loadUsers = async () => {
    try {
      const data = await apiFetch("/users");
      setUsers(data);
    } catch {
      // users endpoint might not exist yet — that's fine
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setMessage("");
    try {
      await apiFetch("/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          owner_id: newOwnerId || null,
        }),
      });
      setNewName("");
      setNewOwnerId("");
      setMessage("Team created!");
      loadTeams();
    } catch (err: any) {
      setMessage("Error: " + err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this team? All assigned players will be unassigned.")) return;
    try {
      await apiFetch(`/teams/${id}`, { method: "DELETE" });
      setMessage("Team deleted");
      loadTeams();
    } catch (err: any) {
      setMessage("Error: " + err.message);
    }
  };

  const ownerName = (ownerId: number | null) => {
    if (!ownerId) return "—";
    return users.find((u) => u.id === ownerId)?.username || `User #${ownerId}`;
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Team Management</h2>

      {message && <p className="text-sm text-emerald-400">{message}</p>}

      {/* Create form */}
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-sm text-gray-400 mb-1">Team Name</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. FC Milano"
            className="w-full px-4 py-2 rounded bg-gray-800 border border-gray-700 focus:border-yellow-500 focus:outline-none"
          />
        </div>
        <div className="w-48">
          <label className="block text-sm text-gray-400 mb-1">Owner (optional)</label>
          <select
            value={newOwnerId}
            onChange={(e) => setNewOwnerId(e.target.value ? parseInt(e.target.value) : "")}
            className="w-full px-4 py-2 rounded bg-gray-800 border border-gray-700 focus:border-yellow-500 focus:outline-none"
          >
            <option value="">No owner</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleCreate}
          className="bg-emerald-600 hover:bg-emerald-700 px-5 py-2 rounded font-semibold transition-colors"
        >
          + Create
        </button>
      </div>

      {/* Teams list */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-gray-400 text-sm border-b border-gray-800">
              <th className="py-2 pr-4">ID</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Owner</th>
              <th className="py-2 pr-4">Budget</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="py-3 pr-4 text-gray-500">{team.id}</td>
                <td className="py-3 pr-4 font-medium">{team.name}</td>
                <td className="py-3 pr-4 text-gray-400">{ownerName(team.owner_id)}</td>
                <td className="py-3 pr-4 text-emerald-400 font-mono">{team.budget}</td>
                <td className="py-3">
                  <button
                    onClick={() => handleDelete(team.id)}
                    className="text-red-400 hover:text-red-300 text-sm transition-colors"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {teams.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-gray-500">No teams yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}