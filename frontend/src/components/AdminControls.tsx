// ─────────────────────────────────────────────
// src/components/AdminControls.tsx
// Admin-only control panel for the auction.
// Start, pause, resume, and stop the auction.
// Only rendered if the current manager is admin.
// ─────────────────────────────────────────────

import { useState } from "react"
import { useAuction } from "../context/AuctionContext"
import { WSMessageType } from "../services/api"

interface AdminControlsProps {
  onSendMessage: (message: object) => void
}

export default function AdminControls({ onSendMessage }: AdminControlsProps) {
  const { auction, isAdmin, isConnected } = useAuction()
  const [confirmStop, setConfirmStop] = useState(false)

  // Only admins see this component
  if (!isAdmin) return null

  const status = auction?.status ?? "waiting"

  // ── Send control action ────────────────────
  function sendAction(action: "start" | "pause" | "resume" | "stop") {
    onSendMessage({
      type: WSMessageType.AUCTION_STATUS_CHANGED,
      payload: { action },
    })
  }

  // ── Handle stop with confirmation ─────────
  function handleStop() {
    if (!confirmStop) {
      setConfirmStop(true)
      // Auto-cancel confirmation after 5 seconds
      setTimeout(() => setConfirmStop(false), 5000)
      return
    }
    setConfirmStop(false)
    sendAction("stop")
  }

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────

  return (
    <div className="bg-gray-900 border border-yellow-900/50 rounded-2xl
                    overflow-hidden">

      {/* Header */}
      <div className="px-4 py-3 bg-yellow-900/20 border-b border-yellow-900/50
                      flex items-center gap-2">
        <span className="text-yellow-400 text-sm">⚙</span>
        <h3 className="text-yellow-400 text-sm font-semibold">
          Pannello Admin
        </h3>
        <span className="ml-auto text-xs text-yellow-700">
          Solo tu puoi vedere questo
        </span>
      </div>

      <div className="p-4 space-y-3">

        {/* Auction status indicator */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Stato asta:</span>
          <span className={`font-semibold px-3 py-1 rounded-full text-xs ${
            status === "active"
              ? "bg-green-900/50 text-green-400 border border-green-800"
              : status === "paused"
              ? "bg-yellow-900/50 text-yellow-400 border border-yellow-800"
              : status === "waiting"
              ? "bg-gray-800 text-gray-400 border border-gray-700"
              : "bg-red-900/50 text-red-400 border border-red-800"
          }`}>
            {status === "active" && "▶ In corso"}
            {status === "paused" && "⏸ In pausa"}
            {status === "waiting" && "⏳ In attesa"}
            {status === "completed" && "✓ Completata"}
          </span>
        </div>

        {/* Control buttons */}
        <div className="space-y-2">

          {/* START — only when waiting */}
          {status === "waiting" && (
            <button
              onClick={() => sendAction("start")}
              disabled={!isConnected}
              className="w-full bg-green-700 hover:bg-green-600
                         disabled:bg-gray-800 disabled:cursor-not-allowed
                         text-white font-semibold py-3 rounded-xl
                         transition-colors text-sm flex items-center
                         justify-center gap-2"
            >
              🚀 Inizia l'asta
            </button>
          )}

          {/* PAUSE — only when active */}
          {status === "active" && (
            <button
              onClick={() => sendAction("pause")}
              disabled={!isConnected}
              className="w-full bg-yellow-700 hover:bg-yellow-600
                         disabled:bg-gray-800 disabled:cursor-not-allowed
                         text-white font-semibold py-3 rounded-xl
                         transition-colors text-sm flex items-center
                         justify-center gap-2"
            >
              ⏸ Pausa
            </button>
          )}

          {/* RESUME — only when paused */}
          {status === "paused" && (
            <button
              onClick={() => sendAction("resume")}
              disabled={!isConnected}
              className="w-full bg-green-700 hover:bg-green-600
                         disabled:bg-gray-800 disabled:cursor-not-allowed
                         text-white font-semibold py-3 rounded-xl
                         transition-colors text-sm flex items-center
                         justify-center gap-2"
            >
              ▶ Riprendi
            </button>
          )}

          {/* STOP — available when active or paused */}
          {(status === "active" || status === "paused") && (
            <button
              onClick={handleStop}
              disabled={!isConnected}
              className={`w-full font-semibold py-3 rounded-xl transition-colors
                          text-sm flex items-center justify-center gap-2
                          disabled:bg-gray-800 disabled:cursor-not-allowed ${
                confirmStop
                  ? "bg-red-600 hover:bg-red-500 text-white animate-pulse"
                  : "bg-gray-800 hover:bg-red-900/50 text-red-400 border border-red-900/50"
              }`}
            >
              {confirmStop
                ? "⚠️ Conferma: Termina asta definitivamente?"
                : "⏹ Termina asta"}
            </button>
          )}

          {/* Cancel confirmation */}
          {confirmStop && (
            <button
              onClick={() => setConfirmStop(false)}
              className="w-full bg-transparent text-gray-500 hover:text-gray-300
                         text-sm py-2 transition-colors"
            >
              Annulla
            </button>
          )}

        </div>

        {/* Connection warning */}
        {!isConnected && (
          <p className="text-red-400 text-xs text-center pt-1">
            ⚠️ Non connesso — riconnessione in corso...
          </p>
        )}

        {/* Auction info */}
        <div className="pt-2 border-t border-gray-800 space-y-1 text-xs
                        text-gray-600">
          <div className="flex justify-between">
            <span>Timer:</span>
            <span className="text-gray-500">{auction?.timer_seconds}s</span>
          </div>
          <div className="flex justify-between">
            <span>Budget/team:</span>
            <span className="text-gray-500">{auction?.budget_per_team} FM</span>
          </div>
        </div>

      </div>
    </div>
  )
}