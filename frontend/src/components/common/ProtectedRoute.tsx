import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

interface Props {
  children: React.ReactNode;
  adminOnly?: boolean;
}

export default function ProtectedRoute({ children, adminOnly = false }: Props) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading…</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== "admin") return <Navigate to="/" replace />;

  return <>{children}</>;
}