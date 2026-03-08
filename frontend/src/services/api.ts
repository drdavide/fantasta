// ─────────────────────────────────────────────
// src/services/api.ts
// All HTTP communication with the FastAPI backend.
// Every component imports from this file — never
// calls fetch() directly.
// ─────────────────────────────────────────────


// ─────────────────────────────────────────────
// TYPESCRIPT INTERFACES
// Mirror the backend Pydantic schemas exactly.
// ─────────────────────────────────────────────

export type PlayerRole = "P" | "D" | "C" | "A"
export type PlayerStatus = "available" | "sold"
export type AuctionStatus = "waiting" | "active" | "paused" | "completed"

export const WSMessageType = {
  BID_PLACED:               "BID_PLACED",
  PLAYER_SOLD:              "PLAYER_SOLD",
  TIMER_UPDATE:             "TIMER_UPDATE",
  TURN_CHANGED:             "TURN_CHANGED",
  PLAYER_CALLED:            "PLAYER_CALLED",
  AUCTION_STATUS_CHANGED:   "AUCTION_STATUS_CHANGED",
  MANAGER_CONNECTED:        "MANAGER_CONNECTED",
  MANAGER_DISCONNECTED:     "MANAGER_DISCONNECTED",
  ERROR:                    "ERROR",
  SYNC:                     "SYNC",
} as const

export type WSMessageType = typeof WSMessageType[keyof typeof WSMessageType]

export interface Player {
  id: string
  name: string
  team: string
  role: PlayerRole
  value: number
  status: PlayerStatus
  sold_to_id?: string
  sold_price?: number
}

export interface Manager {
  id: string
  username: string
  is_admin: boolean
  budget_remaining: number
  turn_order?: number
  is_connected: boolean
  roster: Player[]
}

export interface Auction {
  id: string
  name: string
  budget_per_team: number
  timer_seconds: number
  status: AuctionStatus
  current_caller_id?: string
  created_at: string
  managers: Manager[]
}

export interface Token {
  access_token: string
  token_type: string
}

export interface BidCreate {
  player_id: string
  amount: number
}

export interface WSMessage {
  type: WSMessageType
  payload: Record<string, any>
  timestamp: string
}

export interface ImportSummary {
  total_rows: number
  imported: number
  skipped_duplicates: number
  errors: { row: number; message: string }[]
}

export interface ManagerCreate {
  username: string
  password: string
  is_admin: boolean
  budget_remaining?: number
}

export interface PlayerListResponse {
  players: Player[]
  available_counts: Record<string, number>
  sold_counts: Record<string, number>
  total_available: number
  total_sold: number
}

export interface ManagerRecap {
  manager_id: string
  username: string
  budget_spent: number
  budget_remaining: number
  goalkeepers: Player[]
  defenders: Player[]
  midfielders: Player[]
  forwards: Player[]
  slot_usage: Record<string, string>
}

export interface AuctionRecap {
  auction_id: string
  auction_name: string
  total_managers: number
  total_players_sold: number
  completed_at?: string
  managers: ManagerRecap[]
}


// ─────────────────────────────────────────────
// TOKEN STORAGE
// JWT token is stored in localStorage so it
// persists across page refreshes.
// ─────────────────────────────────────────────

const TOKEN_KEY = "fantacalcio_token"

/** Read the JWT token from localStorage */
export const getToken = (): string | null =>
  localStorage.getItem(TOKEN_KEY)

/** Save the JWT token to localStorage */
export const setToken = (token: string): void =>
  localStorage.setItem(TOKEN_KEY, token)

/** Remove the JWT token from localStorage (logout) */
export const removeToken = (): void =>
  localStorage.removeItem(TOKEN_KEY)

/** Build the Authorization header object */
export const getAuthHeaders = (): Record<string, string> => {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}


// ─────────────────────────────────────────────
// API ERROR
// Custom error class that carries the HTTP
// status code alongside the message.
// ─────────────────────────────────────────────

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}


// ─────────────────────────────────────────────
// BASE FETCH
// All API calls go through this function.
// It handles auth headers, JSON parsing,
// and error responses automatically.
// ─────────────────────────────────────────────

const BASE_URL = "/api"

/**
 * Base fetch wrapper for all API calls.
 * Automatically adds the Authorization header if a token exists.
 * Throws ApiError with status code on non-ok responses.
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...options.headers,
    },
  })

  if (!response.ok) {
    let message = `HTTP error ${response.status}`
    try {
      const errorData = await response.json()
      message = errorData.detail || message
    } catch {
      // Response body wasn't JSON — use default message
    }
    throw new ApiError(message, response.status)
  }

  // Handle empty responses (e.g. 204 No Content)
  const contentType = response.headers.get("content-type")
  if (!contentType || !contentType.includes("application/json")) {
    return undefined as T
  }

  return response.json() as Promise<T>
}


// ─────────────────────────────────────────────
// AUTH API
// ─────────────────────────────────────────────

/**
 * Login with username and password.
 * Returns a JWT token on success.
 * Automatically saves the token to localStorage.
 */
export async function login(
  username: string,
  password: string
): Promise<Token> {
  // FastAPI's OAuth2PasswordRequestForm requires form-encoded data
  // not JSON — this is why we use URLSearchParams here
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password }),
  })

  if (!response.ok) {
    let message = "Credenziali non valide."
    try {
      const errorData = await response.json()
      message = errorData.detail || message
    } catch {}
    throw new ApiError(message, response.status)
  }

  const token: Token = await response.json()
  setToken(token.access_token)
  return token
}

/**
 * Logout — removes the token from localStorage.
 * Also calls the backend logout endpoint.
 */
export async function logout(): Promise<void> {
  try {
    await apiFetch<void>("/auth/logout", { method: "POST" })
  } finally {
    // Always remove the token even if the request fails
    removeToken()
  }
}


// ─────────────────────────────────────────────
// AUCTION API
// ─────────────────────────────────────────────

/**
 * Get full auction details including all managers and rosters.
 */
export async function getAuction(auctionId: string): Promise<Auction> {
  return apiFetch<Auction>(`/auction/${auctionId}`)
}

/**
 * Update auction fields (admin only).
 * Only pass the fields you want to update.
 */
export async function updateAuction(
  auctionId: string,
  data: Partial<{ status: AuctionStatus; timer_seconds: number; current_caller_id: string }>
): Promise<Auction> {
  return apiFetch<Auction>(`/auction/${auctionId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}


// ─────────────────────────────────────────────
// MANAGER API
// ─────────────────────────────────────────────

/**
 * Create a new manager/participant (admin only).
 */
export async function createManager(
  auctionId: string,
  data: ManagerCreate
): Promise<Manager> {
  return apiFetch<Manager>(`/auction/${auctionId}/managers`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

/**
 * List all managers in the auction.
 */
export async function listManagers(auctionId: string): Promise<Manager[]> {
  return apiFetch<Manager[]>(`/auction/${auctionId}/managers`)
}

/**
 * Get the current logged-in manager's profile and full roster.
 */
export async function getMyProfile(auctionId: string): Promise<Manager> {
  return apiFetch<Manager>(`/auction/${auctionId}/managers/me`)
}


// ─────────────────────────────────────────────
// PLAYER API
// ─────────────────────────────────────────────

/**
 * Import players from a CSV file (admin only).
 * Note: uses FormData, not JSON — Content-Type must NOT be set manually.
 */
export async function importPlayers(
  auctionId: string,
  file: File
): Promise<ImportSummary> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(
    `${BASE_URL}/auction/${auctionId}/players/import`,
    {
      method: "POST",
      headers: getAuthHeaders(), // No Content-Type — browser sets it with boundary
      body: formData,
    }
  )

  if (!response.ok) {
    let message = "Errore durante l'importazione."
    try {
      const errorData = await response.json()
      message = errorData.detail || message
    } catch {}
    throw new ApiError(message, response.status)
  }

  return response.json() as Promise<ImportSummary>
}

/**
 * Get the full player pool with available/sold counts per role.
 */
export async function listPlayers(
  auctionId: string
): Promise<PlayerListResponse> {
  return apiFetch<PlayerListResponse>(`/auction/${auctionId}/players`)
}

/**
 * Get available players only, optionally filtered by role.
 */
export async function listAvailablePlayers(
  auctionId: string,
  role?: PlayerRole
): Promise<Player[]> {
  const query = role ? `?role=${role}` : ""
  return apiFetch<Player[]>(`/auction/${auctionId}/players/available${query}`)
}


// ─────────────────────────────────────────────
// EXPORT API
// Triggers a file download in the browser.
// ─────────────────────────────────────────────

/**
 * Download auction results as a CSV file.
 * Creates a temporary link and clicks it to trigger the download.
 */
export async function exportCsv(auctionId: string): Promise<void> {
  const response = await fetch(
    `${BASE_URL}/auction/${auctionId}/export/csv`,
    { headers: getAuthHeaders() }
  )
  if (!response.ok) throw new ApiError("Export CSV failed", response.status)

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `asta_risultati.csv`
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Download auction results as a PDF file.
 * Creates a temporary link and clicks it to trigger the download.
 */
export async function exportPdf(auctionId: string): Promise<void> {
  const response = await fetch(
    `${BASE_URL}/auction/${auctionId}/export/pdf`,
    { headers: getAuthHeaders() }
  )
  if (!response.ok) throw new ApiError("Export PDF failed", response.status)

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `asta_risultati.pdf`
  link.click()
  URL.revokeObjectURL(url)
}


// ─────────────────────────────────────────────
// RECAP API
// ─────────────────────────────────────────────

/**
 * Get the full post-auction recap for all managers.
 */
export async function getRecap(auctionId: string): Promise<AuctionRecap> {
  return apiFetch<AuctionRecap>(`/auction/${auctionId}/export/recap`)
}

/**
 * Register a new user.
 * Returns a JWT token on success.
 * Automatically saves the token to localStorage.
 */
export async function register(
  username: string,
  password: string
): Promise<Token> {
  const response = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })

  if (!response.ok) {
    let message = "Registrazione fallita."
    try {
      const errorData = await response.json()
      message = errorData.detail || message
    } catch {}
    throw new ApiError(message, response.status)
  }

  const token: Token = await response.json()
  setToken(token.access_token)
  return token
}