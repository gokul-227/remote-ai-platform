import axios from "axios";

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
    const refreshToken = typeof window !== "undefined" ? localStorage.getItem("remote_ai_platform_refresh_token") : null;

    // On 401 with a refresh token available — attempt silent token refresh
    if (error.response?.status === 401 && config && !config._retry && refreshToken && !config.url?.includes("/auth/")) {
      config._retry = true;
      try {
        const refresh = await axios.post(`${API_URL}/api/v1/auth/refresh`, { refresh_token: refreshToken });
        const { access_token, refresh_token } = refresh.data;
        localStorage.setItem("remote_ai_platform_token", access_token);
        if (refresh_token) localStorage.setItem("remote_ai_platform_refresh_token", refresh_token);
        if (config.headers) config.headers.Authorization = `Bearer ${access_token}`;
        return api(config);
      } catch {
        // Refresh failed — session fully revoked, clear all credentials and redirect to login
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

export default api;
