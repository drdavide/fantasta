// ─────────────────────────────────────────────
// src/components/RosterPanel.tsx
// Shows all managers, their budgets, connection
// status, and roster counts per role.
// Expandable to show full player list.
// ─────────────────────────────────────────────

import { useState } from "react"
import { useAuction } from "../context/AuctionContext"
import { Manager, Player, PlayerRole } from "../services/api"

const ROLE_ORDER: PlayerRole[] = ["P", "D", "C", "A"]
const ROLE_LIMITS: Record<PlayerRole, number> = { P: 3, D: 8, C: 8, A: 6 }
const ROLE_COLORS: Record<PlayerRole, string> = {
  P: "text-yellow-400",
  D: "text-blue-400",
  C: "text-green-400",
  A: "text-red-400",
}

interface RosterPanelProps {
  showFullRoster?: boolean
}

export default function RosterPanel({ showFullRoster = false }: RosterPanelProps) {
  const { auction, manager: currentManager, currentCallerId } = useAuction()
  const [expandedManagerId, setExpandedManagerId] = useState<string | null>(null)

  const managers = auction?.managers.filter(m => !m.is_admin) ?? []

  // ── Group roster by role ───────────────────
  function getRosterByRole(roster: Player[]): Record<PlayerRole, Player[]> {
    return {
      P: roster.filter(p => p.role === "P"),
      D: roster.filter(p => p.role === "D"),
      C: roster.filter(p => p.role === "C"),
      A: roster.filter(p => p.role === "A"),
    }
  }

  // ── Toggle expand ──────────────────────────
  function toggleExpand(managerId: string) {
    setExpandedManagerId(prev =>
      prev === managerId ? null : managerId
    )
  }

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center
                      justify-between">
        <h3 className="text-white font-semibold text-sm">
          Fantamanager
          <span className="text-gray-500 font-normal ml-2">
            ({managers.length})
          </span>
        </h3>
        <span className="text-gray-600 text-xs">
          {managers.filter(m => m.is_connected).length} connessi
        </span>
      </div>

      {/* Manager list */}
      <div className="divide-y divide-gray-800">
        {managers.map(manager => {
          const isCurrentCaller = manager.id === currentCallerId
          const isMe = manager.id === currentManager?.id
          const isExpanded = expandedManagerId === manager.id
          const rosterByRole = getRosterByRole(manager.roster)
          const totalPlayers = manager.roster.length
          const budgetSpent = (auction?.budget_per_team ?? 0) - manager.budget_remaining

          return (
            <div key={manager.id}>

              {/* Manager row */}
              <button
                onClick={() => toggleExpand(manager.id)}
                className={`w-full px-4 py-3 flex items-center gap-3
                            transition-colors text-left ${
                  isExpanded ? "bg-gray-800" : "hover:bg-gray-800/50"
                }`}
              >
                {/* Connection dot */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  manager.is_connected ? "bg-green-400" : "bg-gray-600"
                }`} />

                {/* Name + badges */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium truncate ${
                      isMe ? "text-green-400" : "text-white"
                    }`}>
                      {manager.username}
                      {isMe && (
                        <span className="text-green-600 text-xs ml-1">(tu)</span>
                      )}
                    </span>

                    {/* Caller badge */}
                    {isCurrentCaller && (
                      <span className="text-xs bg-green-900 text-green-400
                                       px-2 py-0.5 rounded-full border
                                       border-green-800 whitespace-nowrap">
                        🎯 Chiama
                      </span>
                    )}
                  </div>

                  {/* Role slot progress */}
                  <div className="flex items-center gap-2 mt-1">
                    {ROLE_ORDER.map(role => {
                      const count = rosterByRole[role].length
                      const limit = ROLE_LIMITS[role]
                      const full = count >= limit
                      return (
                        <span
                          key={role}
                          className={`text-xs tabular-nums ${
                            full
                              ? ROLE_COLORS[role]
                              : "text-gray-600"
                          }`}
                        >
                          {role}:{count}/{limit}
                        </span>
                      )
                    })}
                  </div>
                </div>

                {/* Budget */}
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold tabular-nums ${
                    manager.budget_remaining < 10
                      ? "text-red-400"
                      : manager.budget_remaining < 50
                      ? "text-yellow-400"
                      : "text-white"
                  }`}>
                    {manager.budget_remaining}
                    <span className="text-gray-600 text-xs font-normal ml-0.5">
                      FM
                    </span>
                  </p>
                  <p className="text-gray-600 text-xs tabular-nums">
                    {totalPlayers}/25
                  </p>
                </div>

                {/* Expand arrow */}
                <span className={`text-gray-600 text-xs transition-transform
                                  flex-shrink-0 ${
                  isExpanded ? "rotate-180" : ""
                }`}>
                  ▾
                </span>
              </button>

              {/* Expanded roster */}
              {isExpanded && (
                <div className="bg-gray-950 px-4 py-3 space-y-3">

                  {/* Budget summary */}
                  <div className="flex gap-4 text-xs pb-2 border-b border-gray-800">
                    <div>
                      <span className="text-gray-500">Budget iniziale: </span>
                      <span className="text-gray-300">
                        {auction?.budget_per_team} FM
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Speso: </span>
                      <span className="text-gray-300">{budgetSpent} FM</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Rimanente: </span>
                      <span className={`font-medium ${
                        manager.budget_remaining < 10
                          ? "text-red-400"
                          : "text-green-400"
                      }`}>
                        {manager.budget_remaining} FM
                      </span>
                    </div>
                  </div>

                  {/* Players by role */}
                  {ROLE_ORDER.map(role => {
                    const rolePlayers = rosterByRole[role]
                    const limit = ROLE_LIMITS[role]

                    return (
                      <div key={role}>
                        {/* Role header */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-xs font-semibold ${ROLE_COLORS[role]}`}>
                            {role === "P" && "Portieri"}
                            {role === "D" && "Difensori"}
                            {role === "C" && "Centrocampisti"}
                            {role === "A" && "Attaccanti"}
                          </span>
                          <span className="text-gray-600 text-xs">
                            {rolePlayers.length}/{limit}
                          </span>
                        </div>

                        {/* Player rows */}
                        {rolePlayers.length === 0 ? (
                          <p className="text-gray-700 text-xs italic pl-2">
                            Nessun giocatore
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {rolePlayers.map(player => (
                              <div
                                key={player.id}
                                className="flex items-center justify-between
                                           bg-gray-900 rounded-lg px-3 py-1.5"
                              >
                                <div className="min-w-0">
                                  <span className="text-white text-xs font-medium
                                                   truncate block">
                                    {player.name}
                                  </span>
                                  <span className="text-gray-600 text-xs">
                                    {player.team}
                                  </span>
                                </div>
                                <span className="text-gray-400 text-xs
                                                 tabular-nums ml-3 flex-shrink-0">
                                  {player.sold_price} FM
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Empty slots */}
                        {Array.from({
                          length: limit - rolePlayers.length
                        }).map((_, i) => (
                          <div
                            key={`empty-${i}`}
                            className="flex items-center bg-gray-900/50
                                       border border-dashed border-gray-800
                                       rounded-lg px-3 py-1.5 mt-1"
                          >
                            <span className="text-gray-700 text-xs italic">
                              Slot vuoto
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {managers.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-600 text-sm">
            Nessun fantamanager
          </div>
        )}
      </div>
    </div>
  )
}