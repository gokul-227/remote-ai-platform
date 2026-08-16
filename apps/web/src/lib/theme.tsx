"use client";

import React, { createContext, useContext, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  /** false during SSR and the initial client render, true once mounted. */
  hasMounted: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
  hasMounted: false,
});

export const THEME_STORAGE_KEY = "theme";

// Inlined into <head> via a blocking script (see layout.tsx) so the correct
// theme attribute is set before first paint — avoids a flash of the wrong theme.
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

const listeners = new Set<() => void>();
function notifyListeners() {
  listeners.forEach((callback) => callback());
}
function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// Same useSyncExternalStore idiom as lib/auth.tsx: reads a client-only
// external store (the <html data-theme> attribute set by THEME_INIT_SCRIPT)
// without the server render and client's first render diverging.
function getServerSnapshot(): Theme {
  return "light";
}
function getClientSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}
function subscribeNoop() {
  return () => {};
}
function getHasMountedServerSnapshot() {
  return false;
}
function getHasMountedClientSnapshot() {
  return true;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const hasMounted = useSyncExternalStore(subscribeNoop, getHasMountedClientSnapshot, getHasMountedServerSnapshot);

  const setTheme = (next: Theme) => {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable (private browsing, disabled storage) — theme just won't persist
    }
    notifyListeners();
  };

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, hasMounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
