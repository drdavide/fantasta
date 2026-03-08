import React, { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { login as apiLogin, register as apiRegister, getToken, removeToken } from "../services/api";

interface User {
  id: string;
  username: string;
  role: string;
  auctionId: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function decodeUser(token: string): User {
  const payload = JSON.parse(atob(token.split(".")[1]));
  return {
    id: payload.manager_id ?? payload.id,
    username: payload.username,
    role: payload.is_admin ? "admin" : "user",
    auctionId: payload.auction_id ?? null,
  };
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (token) {
      try {
        setUser(decodeUser(token));
      } catch {
        removeToken();
      }
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    const data = await apiLogin(username, password);
    const decoded = decodeUser(data.access_token);
    setUser(decoded);
    if (decoded.auctionId) {
      localStorage.setItem("currentAuctionId", decoded.auctionId);
    }
  };

  const register = async (username: string, password: string) => {
    const data = await apiRegister(username, password);
    const decoded = decodeUser(data.access_token);
    setUser(decoded);
    if (decoded.auctionId) {
      localStorage.setItem("currentAuctionId", decoded.auctionId);
    }
  };

  const logout = () => {
    removeToken();
    localStorage.removeItem("currentAuctionId");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};