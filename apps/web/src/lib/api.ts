import axios from "axios";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  timeout: 15_000,
  paramsSerializer: {
    serialize: (params) => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        if (Array.isArray(value)) {
          value.forEach((item) => searchParams.append(key, String(item)));
          return;
        }
        searchParams.append(key, String(value));
      });
      return searchParams.toString();
    },
  },
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor to attach JWT token and a unique request trace ID
api.interceptors.request.use((config) => {
  config.headers["X-Request-ID"] = generateRequestId();
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("remote_ai_platform_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as (typeof error.config & { _retry?: boolean }) | undefined;

    // On 401 — attempt a silent Supabase session refresh, since Supabase
    // (not this app) issues and owns the token lifecycle now.
    if (error.response?.status === 401 && config && !config._retry && !config.url?.includes("/auth/")) {
      config._retry = true;
      try {
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !data.session) throw refreshError || new Error("No session");
        const { access_token, refresh_token } = data.session;
        localStorage.setItem("remote_ai_platform_token", access_token);
        localStorage.setItem("remote_ai_platform_refresh_token", refresh_token);
        if (config.headers) config.headers.Authorization = `Bearer ${access_token}`;
        return api(config);
      } catch {
        // Refresh failed — session fully revoked, clear all credentials and redirect to login
        await supabase.auth.signOut();
        localStorage.removeItem("remote_ai_platform_token");
        localStorage.removeItem("remote_ai_platform_refresh_token");
        localStorage.removeItem("remote_ai_platform_user");
        if (typeof window !== "undefined") {
          window.location.href = "/auth/login?reason=session_expired";
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

// Backend validation errors (422) return `detail` as an array of
// {field, msg} objects; other errors return `detail` as a plain string.
// Callers must not render `detail` directly — React throws when handed an
// array of objects as a child.
export function extractErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const joined = detail
      .map((d) => (typeof d === "string" ? d : (d as { msg?: string })?.msg))
      .filter(Boolean)
      .join(" ");
    return joined || fallback;
  }
  return fallback;
}

export default api;
