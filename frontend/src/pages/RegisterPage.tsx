import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(username, password);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <form onSubmit={handleSubmit} className="bg-gray-900 p-8 rounded-xl shadow-lg w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-emerald-400 text-center">Register</h1>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <input
          type="text" placeholder="Username" value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-4 py-2 rounded bg-gray-800 border border-gray-700 focus:border-emerald-500 focus:outline-none"
        />
        <input
          type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-2 rounded bg-gray-800 border border-gray-700 focus:border-emerald-500 focus:outline-none"
        />
        <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 py-2 rounded font-semibold transition-colors">
          Register
        </button>
        <p className="text-gray-500 text-sm text-center">
          Already have an account? <Link to="/login" className="text-emerald-400 hover:underline">Login</Link>
        </p>
      </form>
    </div>
  );
}