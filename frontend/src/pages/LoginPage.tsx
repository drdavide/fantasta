// // ─────────────────────────────────────────────
// // src/pages/LoginPage.tsx
// // First screen — managers enter their username,
// // password, and auction ID to join the session.
// // ─────────────────────────────────────────────

// import { useState, useEffect, FormEvent } from "react"
// import { useNavigate } from "react-router-dom"
// import { login, getAuction, getMyProfile } from "../services/api"
// import { useAuction } from "../context/AuctionContext"

// export default function LoginPage() {
//   const navigate = useNavigate()
//   const { token, auctionId, setAuctionId, dispatch } = useAuction()

//   const [username, setUsername] = useState("")
//   const [password, setPassword] = useState("")
//   const [auctionIdInput, setAuctionIdInput] = useState(auctionId ?? "")
//   const [isLoading, setIsLoading] = useState(false)
//   const [error, setError] = useState<string | null>(null)

//   // ── Redirect if already logged in ─────────
//   useEffect(() => {
//     if (token && auctionId) {
//       navigate("/waiting")
//     }
//   }, [token, auctionId, navigate])

//   // ── Handle form submit ─────────────────────
//   async function handleSubmit(e: FormEvent) {
//     e.preventDefault()
//     setError(null)
//     setIsLoading(true)

//     try {
//       // Step 1 — Login and get token
//       const tokenData = await login(username, password)

//       // Step 2 — Save auction ID
//       const cleanAuctionId = auctionIdInput.trim()
//       setAuctionId(cleanAuctionId)

//       // Step 3 — Load auction + manager profile
//       const [auction, manager] = await Promise.all([
//         getAuction(cleanAuctionId),
//         getMyProfile(cleanAuctionId),
//       ])

//       // Step 4 — Update global state
//       dispatch({
//         type: "SET_TOKEN",
//         payload: { token: tokenData.access_token, manager },
//       })
//       dispatch({ type: "SET_AUCTION", payload: auction })

//       // Step 5 — Navigate based on auction status
//       if (auction.status === "completed") {
//         navigate("/recap")
//       } else {
//         navigate("/waiting")
//       }

//     } catch (err: any) {
//       setError(err.message ?? "Errore durante il login. Riprova.")
//     } finally {
//       setIsLoading(false)
//     }
//   }

//   // ─────────────────────────────────────────
//   // RENDER
//   // ─────────────────────────────────────────

//   return (
//     <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
//       <div className="w-full max-w-md">

//         {/* Logo / Header */}
//         <div className="text-center mb-10">
//           <div className="text-6xl mb-4">⚽</div>
//           <h1 className="text-4xl font-bold text-white tracking-tight">
//             Fantacalcio
//           </h1>
//           <p className="text-gray-400 mt-2 text-lg">Asta in tempo reale</p>
//         </div>

//         {/* Card */}
//         <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">

//           <h2 className="text-xl font-semibold text-white mb-6">
//             Accedi all'asta
//           </h2>

//           {/* Error banner */}
//           {error && (
//             <div className="mb-6 p-4 bg-red-900/40 border border-red-700 rounded-xl text-red-300 text-sm">
//               {error}
//             </div>
//           )}

//           <form onSubmit={handleSubmit} className="space-y-5">

//             {/* Auction ID */}
//             <div>
//               <label className="block text-sm font-medium text-gray-400 mb-2">
//                 ID Asta
//               </label>
//               <input
//                 type="text"
//                 value={auctionIdInput}
//                 onChange={e => setAuctionIdInput(e.target.value)}
//                 placeholder="es. e18f4032-8dc2-4826-..."
//                 required
//                 className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3
//                            text-white placeholder-gray-600 text-sm
//                            focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500
//                            transition-colors"
//               />
//             </div>

//             {/* Username */}
//             <div>
//               <label className="block text-sm font-medium text-gray-400 mb-2">
//                 Username
//               </label>
//               <input
//                 type="text"
//                 value={username}
//                 onChange={e => setUsername(e.target.value)}
//                 placeholder="Il tuo username"
//                 required
//                 autoComplete="username"
//                 className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3
//                            text-white placeholder-gray-600 text-sm
//                            focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500
//                            transition-colors"
//               />
//             </div>

//             {/* Password */}
//             <div>
//               <label className="block text-sm font-medium text-gray-400 mb-2">
//                 Password
//               </label>
//               <input
//                 type="password"
//                 value={password}
//                 onChange={e => setPassword(e.target.value)}
//                 placeholder="La tua password"
//                 required
//                 autoComplete="current-password"
//                 className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3
//                            text-white placeholder-gray-600 text-sm
//                            focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500
//                            transition-colors"
//               />
//             </div>

//             {/* Submit button */}
//             <button
//               type="submit"
//               disabled={isLoading}
//               className="w-full bg-green-600 hover:bg-green-500 disabled:bg-green-900
//                          disabled:cursor-not-allowed text-white font-semibold
//                          py-3 rounded-xl transition-colors text-sm mt-2"
//             >
//               {isLoading ? (
//                 <span className="flex items-center justify-center gap-2">
//                   <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
//                     <circle className="opacity-25" cx="12" cy="12" r="10"
//                       stroke="currentColor" strokeWidth="4"/>
//                     <path className="opacity-75" fill="currentColor"
//                       d="M4 12a8 8 0 018-8v8z"/>
//                   </svg>
//                   Accesso in corso...
//                 </span>
//               ) : "Entra nell'asta"}
//             </button>

//           </form>
//         </div>

//         {/* Footer hint */}
//         <p className="text-center text-gray-600 text-xs mt-6">
//           Hai bisogno dell'ID asta? Chiedilo all'admin.
//         </p>

//       </div>
//     </div>
//   )
// }

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(username, password);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Login failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <form onSubmit={handleSubmit} className="bg-gray-900 p-8 rounded-xl shadow-lg w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-emerald-400 text-center">FantAsta Login</h1>
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
          Login
        </button>
        <p className="text-gray-500 text-sm text-center">
          No account? <Link to="/register" className="text-emerald-400 hover:underline">Register</Link>
        </p>
      </form>
    </div>
  );
}