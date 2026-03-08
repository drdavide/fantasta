import { useState, useEffect } from "react";
import { apiFetch } from "../../services/api";

interface User {
  id: number;
  username: string;
  role: string;
}

export default function UserManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await apiFetch<User[]>("/users");
      setUsers(data);
    } catch (err: any) {
      setMessage("Failed to load users: " + err.message);
    }
  };

  const toggleRole = async (user: User) => {
    const newRole = user.role === "admin" ? "user" : "admin";
    if (!confirm(`Change ${user.username} role to "${newRole}"?`)) return;
    try {
      await apiFetch(`/api/users/${user.id}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      setMessage(`${user.username} is now ${newRole}`);
      loadUsers();
    } catch (err: any) {
      setMessage("Error: " + err.message);
    }
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/users/${user.id}`, { method: "DELETE" });
      setMessage(`User "${user.username}" deleted`);
      loadUsers();
    } catch (err: any) {
      setMessage("Error: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">User Management</h2>

      {message && <p className="text-sm text-emerald-400">{message}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-gray-400 text-sm border-b border-gray-800">
              <th className="py-2 pr-4">ID</th>
              <th className="py-2 pr-4">Username</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="py-3 pr-4 text-gray-500">{user.id}</td>
                <td className="py-3 pr-4 font-medium">{user.username}</td>
                <td className="py-3 pr-4">
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${
                    user.role === "admin"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-gray-700 text-gray-300"
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="py-3 flex gap-3">
                  <button
                    onClick={() => toggleRole(user)}
                    className="text-yellow-400 hover:text-yellow-300 text-sm transition-colors"
                  >
                    {user.role === "admin" ? "Demote" : "Promote"}
                  </button>
                  <button
                    onClick={() => handleDelete(user)}
                    className="text-red-400 hover:text-red-300 text-sm transition-colors"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-gray-500">No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}