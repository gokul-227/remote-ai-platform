"use client";

import React, { createContext, useContext, useState } from "react";

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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  refreshToken: null,
  loading: false,
  login: () => {},
  logout: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("remote_ai_platform_token");
    }
    return null;
  });

  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== "undefined") {
      const savedUser = localStorage.getItem("remote_ai_platform_user");
      if (savedUser) {
        try {
          return JSON.parse(savedUser);
        } catch {
          return null;
        }
      }
    }
    return null;
  });

  const [refreshToken, setRefreshToken] = useState<string | null>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("remote_ai_platform_refresh_token");
    return null;
  });

  const [loading] = useState(false);

  const login = (newToken: string, newUser: User, newRefreshToken?: string | null) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("remote_ai_platform_token", newToken);
      localStorage.setItem("remote_ai_platform_user", JSON.stringify(newUser));
      if (newRefreshToken) localStorage.setItem("remote_ai_platform_refresh_token", newRefreshToken);
    }
    setToken(newToken);
    setUser(newUser);
    setRefreshToken(newRefreshToken || null);
  };

  const logout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("remote_ai_platform_token");
      localStorage.removeItem("remote_ai_platform_user");
      localStorage.removeItem("remote_ai_platform_refresh_token");
    }
    setToken(null);
    setUser(null);
    setRefreshToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, refreshToken, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
