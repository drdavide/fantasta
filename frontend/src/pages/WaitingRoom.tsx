// ─────────────────────────────────────────────
// src/pages/WaitingRoom.tsx
// Pre-auction lobby. Managers wait here until
// the admin starts the auction.
// Admin can also manage managers and import
// the player CSV from this screen.
// ─────────────────────────────────────────────
import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  listManagers, createManager, importPlayers,
  getToken, type Manager, type ImportSummary
} from "../services/api"
import { useAuth } from "../context/AuthContext"
import { useAuction } from "../context/AuctionContext"
import { useWebSocket } from "../hooks/useWebSocket"

export default function WaitingRoom() {
  const navigate = useNavigate()

  // ── Route param: real auction UUID from the URL ──
  const { auctionId } = useParams<{ auctionId: string }>()

  // ── Auth context: user session ──
  const { user, logout: authLogout } = useAuth()

  // ── Auction context: live game state ──
  const { state, dispatch } = useAuction()

  // ── Derived values ──
  const token = getToken()
  const isAdmin = user?.role === "admin"
  const isConnected = state.isConnected

  // ── WebSocket: pass real auctionId + no-op handler ──
  const { sendMessage } = useWebSocket(auctionId ?? null, () => {})

  const [managers, setManagers] = useState<Manager[]>([])
  const [isLoadingManagers, setIsLoadingManagers] = useState(true)

  // Admin — add manager form
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newIsAdmin, setNewIsAdmin] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)

  // Admin — CSV import
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  // ── Auth guard ─────────────────────────────
  useEffect(() => {
    if (!token || !auctionId) navigate("/")
  }, [token, auctionId, navigate])

  // ── Redirect when auction starts ───────────
  useEffect(() => {
    if (state.status === "active" || state.status === "paused") {
      navigate(`/auction/${auctionId}`)
    }
    if (state.status === "completed") {
      navigate(`/recap/${auctionId}`)
    }
  }, [state.status, auctionId, navigate])

  // ── Load managers ──────────────────────────
  useEffect(() => {
    if (!auctionId) return
    loadManagers()
  }, [auctionId])

  async function loadManagers() {
    try {
      setIsLoadingManagers(true)
      const data = await listManagers(auctionId!)
      setManagers(data)
    } catch (err: any) {
      console.error("Failed to load managers:", err)
    } finally {
      setIsLoadingManagers(false)
    }
  }

  // ── Create manager ─────────────────────────
  async function handleCreateManager(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setCreateSuccess(null)
    setIsCreating(true)
    try {
      await createManager(auctionId!, {
        username: newUsername,
        password: newPassword,
        is_admin: newIsAdmin,
      })
      setCreateSuccess(`✓ Manager "${newUsername}" creato!`)
      setNewUsername("")
      setNewPassword("")
      setNewIsAdmin(false)
      await loadManagers()
    } catch (err: any) {
      setCreateError(err.message ?? "Errore nella creazione del manager.")
    } finally {
      setIsCreating(false)
    }
  }

  // ── CSV import ─────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)
    setImportSummary(null)
    setIsImporting(true)
    try {
      const summary = await importPlayers(auctionId!, file)
      setImportSummary(summary)
    } catch (err: any) {
      setImportError(err.message ?? "Errore durante l'importazione.")
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  // ── Start auction ──────────────────────────
  function handleStartAuction() {
    sendMessage({
      type: "AUCTION_STATUS_CHANGED",
      payload: { action: "start" },
    })
  }

  // ── Logout ─────────────────────────────────
  function handleLogout() {
    authLogout()
    dispatch({ type: "RESET" })
    navigate("/")
  }

  // ── Connected managers count ───────────────
  const connectedCount = managers.filter(m => m.is_connected).length
  const nonAdminManagers = managers.filter(m => !m.is_admin)

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4
                         flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚽</span>
          <div>
            <h1 className="font-bold text-white text-lg leading-tight">
              Fantacalcio Asta
            </h1>
            <p className="text-gray-500 text-xs">Sala d'attesa</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Connection status */}
          <div className="flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-400 animate-pulse" : "bg-gray-600"
            }`}/>
            <span className={isConnected ? "text-green-400" : "text-gray-500"}>
              {isConnected ? "Connesso" : "Disconnesso"}
            </span>
          </div>

          {/* Manager name + logout */}
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm">
              {user?.username}
              {isAdmin && (
                <span className="ml-2 text-xs bg-green-900 text-green-400
                                 px-2 py-0.5 rounded-full">
                  Admin
                </span>
              )}
            </span>
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-red-400 text-sm transition-colors"
            >
              Esci
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Status banner */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6
                        flex flex-col sm:flex-row items-start sm:items-center
                        justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">
              In attesa dell'inizio...
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              {connectedCount} di {nonAdminManagers.length} fantamanager connessi
            </p>
          </div>

          {/* Admin: start button */}
          {isAdmin && (
            <button
              onClick={handleStartAuction}
              disabled={!isConnected || nonAdminManagers.length === 0}
              className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700
                         disabled:cursor-not-allowed text-white font-semibold
                         px-8 py-3 rounded-xl transition-colors whitespace-nowrap"
            >
              🚀 Inizia l'asta
            </button>
          )}
        </div>

        {/* Managers list */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Fantamanager ({nonAdminManagers.length})
          </h3>

          {isLoadingManagers ? (
            <div className="text-gray-500 text-sm">Caricamento...</div>
          ) : nonAdminManagers.length === 0 ? (
            <div className="text-gray-500 text-sm">
              Nessun fantamanager ancora. Aggiungine uno qui sotto.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {nonAdminManagers.map(m => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3"
                >
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    m.is_connected ? "bg-green-400" : "bg-gray-600"
                  }`}/>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {m.username}
                    </p>
                    <p className="text-gray-500 text-xs">
                      {m.budget_remaining} FM
                      {m.is_admin && " · Admin"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin panel */}
        {isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Add manager */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Aggiungi Fantamanager
              </h3>

              {createError && (
                <div className="mb-4 p-3 bg-red-900/40 border border-red-700
                                rounded-xl text-red-300 text-sm">
                  {createError}
                </div>
              )}
              {createSuccess && (
                <div className="mb-4 p-3 bg-green-900/40 border border-green-700
                                rounded-xl text-green-300 text-sm">
                  {createSuccess}
                </div>
              )}

              <form onSubmit={handleCreateManager} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Username
                  </label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    placeholder="es. Luca"
                    required
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl
                               px-4 py-2.5 text-white placeholder-gray-600 text-sm
                               focus:outline-none focus:border-green-500
                               focus:ring-1 focus:ring-green-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Password
                  </label>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Imposta una password"
                    required
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl
                               px-4 py-2.5 text-white placeholder-gray-600 text-sm
                               focus:outline-none focus:border-green-500
                               focus:ring-1 focus:ring-green-500 transition-colors"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isAdmin"
                    checked={newIsAdmin}
                    onChange={e => setNewIsAdmin(e.target.checked)}
                    className="w-4 h-4 accent-green-500"
                  />
                  <label htmlFor="isAdmin" className="text-sm text-gray-400">
                    Ruolo Admin
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="w-full bg-green-600 hover:bg-green-500
                             disabled:bg-green-900 disabled:cursor-not-allowed
                             text-white font-semibold py-2.5 rounded-xl
                             transition-colors text-sm"
                >
                  {isCreating ? "Creazione..." : "Aggiungi Manager"}
                </button>
              </form>
            </div>

            {/* Import CSV */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-1">
                Importa Giocatori
              </h3>
              <p className="text-gray-500 text-xs mb-4">
                CSV con colonne: Name, Team, Role, Value
              </p>

              {importError && (
                <div className="mb-4 p-3 bg-red-900/40 border border-red-700
                                rounded-xl text-red-300 text-sm">
                  {importError}
                </div>
              )}

              {importSummary && (
                <div className="mb-4 p-4 bg-gray-800 rounded-xl space-y-1 text-sm">
                  <p className="text-green-400 font-medium">
                    ✓ Importazione completata
                  </p>
                  <p className="text-gray-300">
                    Importati: <span className="text-white font-medium">
                      {importSummary.imported}
                    </span>
                  </p>
                  <p className="text-gray-300">
                    Duplicati saltati: <span className="text-white font-medium">
                      {importSummary.skipped_duplicates}
                    </span>
                  </p>
                  {importSummary.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-red-400 text-xs font-medium mb-1">
                        Errori ({importSummary.errors.length}):
                      </p>
                      <div className="space-y-0.5 max-h-28 overflow-y-auto">
                        {importSummary.errors.map((err, i) => (
                          <p key={i} className="text-red-300 text-xs">
                            Riga {err.row}: {err.message}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="w-full border-2 border-dashed border-gray-700
                           hover:border-green-600 disabled:border-gray-800
                           disabled:cursor-not-allowed text-gray-400
                           hover:text-green-400 rounded-xl py-8
                           transition-colors text-sm font-medium"
              >
                {isImporting ? (
                  "Importazione in corso..."
                ) : (
                  <span>
                    📂 Clicca per selezionare il CSV
                    <br />
                    <span className="text-xs text-gray-600 font-normal mt-1 block">
                      Name, Team, Role, Value
                    </span>
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Auction info footer */}
        <div className="text-center text-gray-600 text-xs space-y-1">
          <p>ID Asta: <span className="font-mono">{auctionId}</span></p>
        </div>
      </div>
    </div>
  )
}