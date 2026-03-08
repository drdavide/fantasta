// src/App.tsx
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Layout from "./components/layout/Layout";
import ProtectedRoute from "./components/common/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

// Lazy-loaded pages (code-split per route)
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const AuctionRoom = lazy(() => import("./pages/AuctionRoom"));
const PlayersPage = lazy(() => import("./pages/PlayersPage"));
const TeamsPage = lazy(() => import("./pages/TeamsPage"));
const RecapPage = lazy(() => import("./pages/RecapPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <span className="text-sm text-muted-foreground">Loading…</span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Authenticated routes */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />

              {/* Auction-scoped routes */}
              <Route path="auction/:auctionId" element={<AuctionRoom />} />
              <Route path="auction/:auctionId/players" element={<PlayersPage />} />
              <Route path="auction/:auctionId/teams" element={<TeamsPage />} />
              <Route path="auction/:auctionId/recap" element={<RecapPage />} />

              {/* Admin-only */}
              <Route
                path="admin"
                element={
                  <ProtectedRoute adminOnly>
                    <AdminPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Catch-all: redirect to dashboard */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}