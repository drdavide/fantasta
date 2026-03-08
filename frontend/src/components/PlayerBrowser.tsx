// ─────────────────────────────────────────────
// src/components/PlayerBrowser.tsx
// Player picker for the caller.
// Full searchable list with filters by role,
// team, name, and sorted by value.
// ─────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react"
import { listAvailablePlayers, Player, PlayerRole } from "../services/api"
import { useAuction } from "../context/AuctionContext"

interface PlayerBrowserProps {
  auctionId: string
  onCallPlayer: (player: Player) => void
  disabled?: boolean
}

const ROLE_LABELS: Record<PlayerRole, string> = {
  P: "Portieri",
  D: "Difensori",
  C: "Centrocampisti",
  A: "Attaccanti",
}

const ROLE_COLORS: Record<PlayerRole, string> = {
  P: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
  D: "bg-blue-900/50 text-blue-400 border-blue-800",
  C: "bg-green-900/50 text-green-400 border-green-800",
  A: "bg-red-900/50 text-red-400 border-red-800",
}

type SortKey = "name" | "team" | "value"

export default function PlayerBrowser({
  auctionId,
  onCallPlayer,
  disabled = false,
}: PlayerBrowserProps) {
  const { manager } = useAuction()

  const [players, setPlayers] = useState<Player[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<PlayerRole | "ALL">("ALL")
  const [sortKey, setSortKey] = useState<SortKey>("value")
  const [sortDesc, setSortDesc] = useState(true)

  // ── Load available players ─────────────────
  useEffect(() => {
    loadPlayers()
  }, [auctionId])

  async function loadPlayers() {
    try {
      setIsLoading(true)
      const data = await listAvailablePlayers(auctionId)
      setPlayers(data)
    } catch (err) {
      console.error("Failed to load players:", err)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Check if manager's slot is full for role ──
  function isRoleFull(role: PlayerRole): boolean {
    if (!manager) return false
    const limits: Record<PlayerRole, number> = {
      P: 3, D: 8, C: 8, A: 6,
    }
    const count = manager.roster.filter(p => p.role === role).length
    return count >= limits[role]
  }

  // ── Filter + sort ──────────────────────────
  const filtered = useMemo(() => {
    let result = [...players]

    // Role filter
    if (roleFilter !== "ALL") {
      result = result.filter(p => p.role === roleFilter)
    }

    // Search filter (name or team)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          p.team.toLowerCase().includes(q)
      )
    }

    // Sort
    result.sort((a, b) => {
      let valA: string | number = a[sortKey]
      let valB: string | number = b[sortKey]

      if (typeof valA === "string") valA = valA.toLowerCase()
      if (typeof valB === "string") valB = valB.toLowerCase()

      if (valA < valB) return sortDesc ? 1 : -1
      if (valA > valB) return sortDesc ? -1 : 1
      return 0
    })

    return result
  }, [players, roleFilter, search, sortKey, sortDesc])

  // ── Toggle sort ────────────────────────────
  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc(prev => !prev)
    } else {
      setSortKey(key)
      setSortDesc(key === "value") // Value sorts desc by default
    }
  }

  // ── Count available per role ───────────────
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { P: 0, D: 0, C: 0, A: 0 }
    players.forEach(p => counts[p.role]++)
    return counts
  }, [players])

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gray-900 border border-gray-800
                    rounded-2xl overflow-hidden">

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold text-sm">
            Giocatori Disponibili
            <span className="ml-2 text-gray-500 font-normal">
              ({filtered.length}/{players.length})
            </span>
          </h3>
          <button
            onClick={loadPlayers}
            className="text-gray-500 hover:text-green-400 text-xs
                       transition-colors"
          >
            ↻ Aggiorna
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca per nome o squadra..."
          className="w-full bg-gray-800 border border-gray-700 rounded-xl
                     px-3 py-2 text-white placeholder-gray-600 text-sm
                     focus:outline-none focus:border-green-500 mb-3
                     transition-colors"
        />

        {/* Role filters */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setRoleFilter("ALL")}
            className={`px-3 py-1 rounded-lg text-xs font-medium border
                        transition-colors ${
              roleFilter === "ALL"
                ? "bg-gray-700 text-white border-gray-600"
                : "bg-transparent text-gray-500 border-gray-700 hover:border-gray-500"
            }`}
          >
            Tutti ({players.length})
          </button>
          {(["P", "D", "C", "A"] as PlayerRole[]).map(role => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border
                          transition-colors ${
                roleFilter === role
                  ? ROLE_COLORS[role]
                  : "bg-transparent text-gray-500 border-gray-700 hover:border-gray-500"
              }`}
            >
              {role} ({roleCounts[role]})
            </button>
          ))}
        </div>
      </div>

      {/* Sort bar */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-gray-800
                      text-xs text-gray-500">
        <div className="col-span-1">Ruolo</div>
        <button
          className={`col-span-5 text-left hover:text-gray-300 transition-colors
                      flex items-center gap-1 ${
            sortKey === "name" ? "text-green-400" : ""
          }`}
          onClick={() => handleSort("name")}
        >
          Nome {sortKey === "name" && (sortDesc ? "↓" : "↑")}
        </button>
        <button
          className={`col-span-3 text-left hover:text-gray-300 transition-colors
                      flex items-center gap-1 ${
            sortKey === "team" ? "text-green-400" : ""
          }`}
          onClick={() => handleSort("team")}
        >
          Squadra {sortKey === "team" && (sortDesc ? "↓" : "↑")}
        </button>
        <button
          className={`col-span-3 text-right hover:text-gray-300 transition-colors
                      flex items-center justify-end gap-1 ${
            sortKey === "value" ? "text-green-400" : ""
          }`}
          onClick={() => handleSort("value")}
        >
          {sortKey === "value" && (sortDesc ? "↓" : "↑")} FM
        </button>
      </div>

      {/* Player list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
            Caricamento giocatori...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
            Nessun giocatore trovato
          </div>
        ) : (
          filtered.map(player => {
            const roleFull = isRoleFull(player.role)
            const noBudget = (manager?.budget_remaining ?? 0) < 1
            const cantCall = disabled || roleFull || noBudget

            return (
              <button
                key={player.id}
                onClick={() => !cantCall && onCallPlayer(player)}
                disabled={cantCall}
                className={`w-full grid grid-cols-12 gap-2 px-4 py-3
                            border-b border-gray-800/50 text-left
                            transition-colors group ${
                  cantCall
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-gray-800 cursor-pointer"
                }`}
              >
                {/* Role badge */}
                <div className="col-span-1 flex items-center">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded
                                    border ${ROLE_COLORS[player.role]}`}>
                    {player.role}
                  </span>
                </div>

                {/* Name */}
                <div className="col-span-5 flex items-center">
                  <span className={`text-sm font-medium truncate ${
                    cantCall ? "text-gray-500" : "text-white group-hover:text-green-400"
                  } transition-colors`}>
                    {player.name}
                  </span>
                </div>

                {/* Team */}
                <div className="col-span-3 flex items-center">
                  <span className="text-xs text-gray-500 truncate">
                    {player.team}
                  </span>
                </div>

                {/* Value */}
                <div className="col-span-3 flex items-center justify-end">
                  <span className="text-xs text-gray-400 font-medium tabular-nums">
                    {player.value > 0 ? `${player.value}` : "—"}
                    <span className="text-gray-600 ml-0.5">FM</span>
                  </span>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}