import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  timeout: 5000,
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

// Interceptor to attach JWT token if present
api.interceptors.request.use((config) => {
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
    if (error.response?.status !== 401 || !config || config._retry || !refreshToken || config.url?.includes("/auth/")) {
      return Promise.reject(error);
    }
    config._retry = true;
    try {
      const refresh = await axios.post(`${API_URL}/api/v1/auth/refresh`, { refresh_token: refreshToken });
      const { access_token, refresh_token } = refresh.data;
      localStorage.setItem("remote_ai_platform_token", access_token);
      if (refresh_token) localStorage.setItem("remote_ai_platform_refresh_token", refresh_token);
      config.headers.Authorization = `Bearer ${access_token}`;
      return api(config);
    } catch {
      localStorage.removeItem("remote_ai_platform_token");
      localStorage.removeItem("remote_ai_platform_refresh_token");
      return Promise.reject(error);
    }
  },
);

export default api;
