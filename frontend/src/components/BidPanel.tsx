// ─────────────────────────────────────────────
// src/components/BidPanel.tsx
// Shows the current player being bid on,
// the highest bid, and the bid buttons.
// (+1, +5, +10, custom amount)
// ─────────────────────────────────────────────

import { useState } from "react"
import { useAuction } from "../context/AuctionContext"
import { WSMessageType } from "../services/api"
import Timer from "./Timer"

interface BidPanelProps {
  onSendMessage: (message: object) => void
  totalTimerSeconds: number
}

const ROLE_LABELS: Record<string, string> = {
  P: "Portiere",
  D: "Difensore",
  C: "Centrocampista",
  A: "Attaccante",
}

const ROLE_COLORS: Record<string, string> = {
  P: "text-yellow-400 bg-yellow-900/30 border-yellow-800",
  D: "text-blue-400 bg-blue-900/30 border-blue-800",
  C: "text-green-400 bg-green-900/30 border-green-800",
  A: "text-red-400 bg-red-900/30 border-red-800",
}

export default function BidPanel({
  onSendMessage,
  totalTimerSeconds,
}: BidPanelProps) {
  const {
    manager,
    currentPlayer,
    currentHighestBid,
    currentHighestBidderId,
    currentHighestBidderUsername,
    currentCallerId,
  } = useAuction()

  const [customAmount, setCustomAmount] = useState("")
  const [bidError, setBidError] = useState<string | null>(null)

  const isMyBid = currentHighestBidderId === manager?.id
  const budget = manager?.budget_remaining ?? 0

  // ── Place a bid ────────────────────────────
  function handleBid(amount: number) {
    setBidError(null)

    if (!currentPlayer) return

    if (amount <= currentHighestBid) {
      setBidError(`L'offerta deve essere superiore a ${currentHighestBid} FM.`)
      return
    }

    if (amount > budget) {
      setBidError(`Budget insufficiente. Hai ${budget} FM disponibili.`)
      return
    }

    if (isMyBid) {
      setBidError("Sei già il maggior offerente!")
      return
    }

    onSendMessage({
      type: WSMessageType.BID_PLACED,
      payload: {
        player_id: currentPlayer.id,
        amount,
      },
    })
  }

  // ── Custom bid ─────────────────────────────
  function handleCustomBid() {
    const amount = parseInt(customAmount, 10)
    if (isNaN(amount) || amount < 1) {
      setBidError("Inserisci un importo valido.")
      return
    }
    handleBid(amount)
    setCustomAmount("")
  }

  // ── Quick bid buttons (+1, +5, +10) ────────
  const quickBids = [
    { label: "+1", delta: 1 },
    { label: "+5", delta: 5 },
    { label: "+10", delta: 10 },
  ]

  // ─────────────────────────────────────────
  // RENDER — No active player
  // ─────────────────────────────────────────

  if (!currentPlayer) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6
                      flex flex-col items-center justify-center min-h-48 text-center">
        <div className="text-4xl mb-3">⏳</div>
        <p className="text-gray-400 font-medium">
          In attesa della prossima chiamata...
        </p>
        {currentCallerId === manager?.id ? (
          <p className="text-green-400 text-sm mt-2 font-semibold">
            🎯 È il tuo turno! Chiama un giocatore.
          </p>
        ) : (
          <p className="text-gray-600 text-sm mt-2">
            Tocca a{" "}
            <span className="text-gray-400">
              {currentHighestBidderUsername ?? "..."}
            </span>{" "}
            chiamare.
          </p>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────
  // RENDER — Active player
  // ─────────────────────────────────────────

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">

      {/* Player info header */}
      <div className="bg-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Role badge */}
          <div className={`px-3 py-1.5 rounded-xl border text-sm font-bold
                           ${ROLE_COLORS[currentPlayer.role]}`}>
            {currentPlayer.role}
          </div>

          {/* Player details */}
          <div>
            <h2 className="text-white text-xl font-bold leading-tight">
              {currentPlayer.name}
            </h2>
            <p className="text-gray-400 text-sm">
              {currentPlayer.team}
              <span className="text-gray-600 mx-2">·</span>
              {ROLE_LABELS[currentPlayer.role]}
              {currentPlayer.value > 0 && (
                <>
                  <span className="text-gray-600 mx-2">·</span>
                  <span className="text-gray-500">
                    Quotazione: {currentPlayer.value} FM
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Timer */}
        <Timer totalSeconds={totalTimerSeconds} />
      </div>

      {/* Bid status */}
      <div className="px-6 py-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">
              Offerta più alta
            </p>
            <p className="text-4xl font-bold tabular-nums text-white">
              {currentHighestBid}
              <span className="text-gray-500 text-xl ml-1 font-normal">FM</span>
            </p>
          </div>

          <div className="text-right">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">
              Maggior offerente
            </p>
            <p className={`text-lg font-semibold ${
              isMyBid ? "text-green-400" : "text-white"
            }`}>
              {isMyBid ? "🏆 Tu!" : (currentHighestBidderUsername ?? "—")}
            </p>
          </div>
        </div>

        {/* My budget */}
        <div className="mt-3 pt-3 border-t border-gray-800 flex items-center
                        justify-between text-sm">
          <span className="text-gray-500">Il tuo budget:</span>
          <span className={`font-semibold tabular-nums ${
            budget < 10 ? "text-red-400" : "text-white"
          }`}>
            {budget} FM
          </span>
        </div>
      </div>

      {/* Bid controls */}
      <div className="px-6 py-4 space-y-4">

        {/* Error message */}
        {bidError && (
          <div className="p-3 bg-red-900/40 border border-red-700 rounded-xl
                          text-red-300 text-sm">
            {bidError}
          </div>
        )}

        {/* Quick bid buttons */}
        <div className="grid grid-cols-3 gap-3">
          {quickBids.map(({ label, delta }) => {
            const newAmount = currentHighestBid + delta
            const canBid = !isMyBid && newAmount <= budget

            return (
              <button
                key={label}
                onClick={() => handleBid(newAmount)}
                disabled={!canBid}
                className={`py-4 rounded-xl font-bold text-lg transition-colors
                            border ${
                  canBid
                    ? "bg-green-700 hover:bg-green-600 border-green-600 text-white"
                    : "bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed"
                }`}
              >
                {label}
                <span className="block text-xs font-normal text-green-300 mt-0.5">
                  {canBid ? `→ ${newAmount} FM` : "—"}
                </span>
              </button>
            )
          })}
        </div>

        {/* Custom bid */}
        <div className="flex gap-2">
          <input
            type="number"
            value={customAmount}
            onChange={e => {
              setCustomAmount(e.target.value)
              setBidError(null)
            }}
            onKeyDown={e => e.key === "Enter" && handleCustomBid()}
            placeholder={`Importo personalizzato (min. ${currentHighestBid + 1})`}
            min={currentHighestBid + 1}
            max={budget}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl
                       px-4 py-3 text-white placeholder-gray-600 text-sm
                       focus:outline-none focus:border-green-500
                       focus:ring-1 focus:ring-green-500 transition-colors
                       [appearance:textfield]"
          />
          <button
            onClick={handleCustomBid}
            disabled={isMyBid || !customAmount}
            className="bg-green-700 hover:bg-green-600 disabled:bg-gray-800
                       disabled:cursor-not-allowed text-white font-semibold
                       px-5 py-3 rounded-xl transition-colors text-sm
                       whitespace-nowrap border border-green-600
                       disabled:border-gray-700"
          >
            Offri
          </button>
        </div>

        {/* Already winning message */}
        {isMyBid && (
          <div className="text-center p-3 bg-green-900/20 border border-green-800
                          rounded-xl text-green-400 text-sm font-medium">
            🏆 Sei il maggior offerente! Aspetta la scadenza del timer.
          </div>
        )}

      </div>
    </div>
  )
}