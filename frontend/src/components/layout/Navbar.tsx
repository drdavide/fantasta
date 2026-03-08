import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function Navbar() {
  const navigate = useNavigate();
  const { user, logout, isAuthenticated } = useAuth();
  const { auctionId } = useParams();
  const activeAuctionId = auctionId || user?.auctionId || localStorage.getItem("currentAuctionId");

  // const activeAuctionId = auctionId || localStorage.getItem("currentAuctionId");

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (!isAuthenticated) return null;

  return (
    <nav className="bg-gray-900 text-white px-6 py-3 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-6">
        <Link to="/" className="text-xl font-bold tracking-tight text-emerald-400">
          FantAsta
        </Link>
        <Link
          to={activeAuctionId ? `/auction/${activeAuctionId}` : '/'}
          className="hover:text-emerald-300 transition-colors"
        >
          Auction
        </Link>
        <Link
          to={activeAuctionId ? `/auction/${activeAuctionId}/teams` : '/'}
          className="hover:text-emerald-300 transition-colors"
        >
          Teams
        </Link>
        <Link
          to={activeAuctionId ? `/auction/${activeAuctionId}/players` : '/'}
          className="hover:text-emerald-300 transition-colors"
        >
          Players
        </Link>
        {user?.role === "admin" && (
          <Link to="/admin" className="hover:text-yellow-300 transition-colors">
            Admin
          </Link>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-400">
          {user?.username}{" "}
          {user?.role === "admin" && (
            <span className="text-yellow-400 text-xs">(admin)</span>
          )}
        </span>
        <button
          onClick={handleLogout}
          className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm transition-colors"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}