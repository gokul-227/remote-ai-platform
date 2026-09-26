"use client";

import React, { createContext, useContext, useSyncExternalStore } from "react";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: "ENGINEER" | "COMPANY" | "ADMIN";
  avatar_url?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  loading: boolean;
  login: (token: string, user: User, refreshToken?: string | null) => void;
  logout: () => void;
  updateUser: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  refreshToken: null,
  loading: false,
  login: () => {},
  logout: () => {},
  updateUser: () => {},
});

const TOKEN_KEY = "remote_ai_platform_token";
const USER_KEY = "remote_ai_platform_user";
const REFRESH_TOKEN_KEY = "remote_ai_platform_refresh_token";

interface StoredSession {
  token: string | null;
  user: User | null;
  refreshToken: string | null;
}

const SERVER_SNAPSHOT: StoredSession = { token: null, user: null, refreshToken: null };

// Module-scoped so every AuthProvider instance (and login/logout call) shares
// one source of truth, matching useSyncExternalStore's contract that
// getSnapshot returns a referentially-stable value until something actually
// changes it.
let cachedRaw = "";
let cachedSnapshot: StoredSession = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function readStoredSession(): StoredSession {
  const token = localStorage.getItem(TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  const rawUser = localStorage.getItem(USER_KEY);
  let user: User | null = null;
  if (rawUser) {
    try {
      user = JSON.parse(rawUser);
    } catch {
      // ignore corrupt stored session
    }
  }
  return { token, user, refreshToken };
}

// getSnapshot is called on every render, so it must not allocate a new object
// unless the underlying storage actually changed — otherwise useSyncExternalStore
// would see a "changed" reference every time and re-render in a loop.
function getClientSnapshot(): StoredSession {
  const next = readStoredSession();
  const nextRaw = JSON.stringify(next);
  if (nextRaw !== cachedRaw) {
    cachedRaw = nextRaw;
    cachedSnapshot = next;
  }
  return cachedSnapshot;
}

function getServerSnapshot(): StoredSession {
  return SERVER_SNAPSHOT;
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

// Our own writes don't fire the native "storage" event (that only fires in
// *other* tabs/windows), so login()/logout() call this explicitly.
function notifyListeners() {
  listeners.forEach((callback) => callback());
}

// Standard useSyncExternalStore-based replacement for the classic
// `useEffect(() => setHasMounted(true), [])` idiom — gives RequireAuth/
// RequireRole a real "still hydrating" signal (loading: true until the
// client snapshot lands) without a setState-in-effect. Without this, the
// guards' redirect-on-no-user effect fires on the very first (server-
// snapshot) render of a full page load and sends a genuinely logged-in user
// back to /auth/login a beat before the real session is read.
function subscribeNoop() {
  return () => {};
}
function getHasMountedServerSnapshot() {
  return false;
}
function getHasMountedClientSnapshot() {
  return true;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // useSyncExternalStore is the React-supplied tool for exactly this problem:
  // reading a client-only external store (localStorage) without the server's
  // render and the client's first render diverging. It renders
  // getServerSnapshot() during SSR and hydration, then synchronously
  // re-renders with getClientSnapshot() right after mount — no separate
  // effect + setState cascade, and no hydration-mismatch warning.
  const { token, user, refreshToken } = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const hasMounted = useSyncExternalStore(subscribeNoop, getHasMountedClientSnapshot, getHasMountedServerSnapshot);

  const login = (newToken: string, newUser: User, newRefreshToken?: string | null) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    if (newRefreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
    notifyListeners();
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    notifyListeners();
  };

  // For updates to the current session's user object that don't warrant a
  // full re-login — e.g. the workspace switcher's PATCH /auth/role, which
  // changes the account's active role without issuing a new token.
  const updateUser = (patch: Partial<User>) => {
    const current = readStoredSession().user;
    if (!current) return;
    const merged = { ...current, ...patch };
    localStorage.setItem(USER_KEY, JSON.stringify(merged));
    notifyListeners();
  };

  return (
    <AuthContext.Provider value={{ user, token, refreshToken, loading: !hasMounted, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
