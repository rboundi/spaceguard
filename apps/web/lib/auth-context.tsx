"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  isActive?: boolean;
  lastLogin?: string | null;
  createdAt?: string;
  notifyCriticalAlerts?: boolean;
  notifyDeadlines?: boolean;
  notifyWeeklyDigest?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  loading: true,
  login: async () => undefined,
  logout: () => undefined,
  refreshUser: async () => undefined,
});

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const TOKEN_KEY = "spaceguard_token";
const USER_KEY = "spaceguard_user";

function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function writeToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
}

function removeToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

function readUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) as AuthUser : null;
  } catch { return null; }
}

function writeUser(user: AuthUser): void {
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* ignore */ }
}

function removeUser(): void {
  try { localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize state synchronously from localStorage so it survives
  // React 18 Strict Mode double-mount in development.
  const [user, setUser] = useState<AuthUser | null>(() => readUser());
  const [token, setToken] = useState<string | null>(() => readToken());
  const [loading, setLoading] = useState(() => !!(readToken() && readUser()));

  // On mount, validate the stored token against the API
  useEffect(() => {
    if (!token || !user) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    fetch(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const freshUser = await res.json() as AuthUser;
          setUser(freshUser);
          writeUser(freshUser);
        } else {
          // Token expired/invalid
          removeToken();
          removeUser();
          setToken(null);
          setUser(null);
        }
      })
      .catch(() => {
        // Network error; keep cached user for now
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(typeof body.error === "string" ? body.error : "Login failed");
    }

    const data = await res.json() as { token: string; user: AuthUser };
    setToken(data.token);
    setUser(data.user);
    writeToken(data.token);
    writeUser(data.user);
  }, []);

  const logout = useCallback(() => {
    const t = readToken();
    if (t) {
      // Fire-and-forget logout call
      fetch(`${API_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
      }).catch(() => { /* ignore */ });
    }
    removeToken();
    removeUser();
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const t = readToken();
    if (!t) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const freshUser = await res.json() as AuthUser;
        setUser(freshUser);
        writeUser(freshUser);
      }
    } catch {
      // Ignore network errors
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// ---------------------------------------------------------------------------
// Helper: get current token (for API client)
// ---------------------------------------------------------------------------

export function getAuthToken(): string | null {
  return readToken();
}
