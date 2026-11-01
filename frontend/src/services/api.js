import axios from "axios";

export const API_BASE =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const AUTH_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("auth_user") || "null");
  } catch {
    return null;
  }
}

function loginPathFor(role) {
  if (role === "admin") return "/admin/login";
  if (role === "teacher") return "/teacher/login";
  if (role === "student") return "/student/login";
  return "/";
}

function handleUnauthorized(url) {
  const path = String(url || "").replace(API_BASE, "");
  if (AUTH_PATHS.some((p) => path.startsWith(p))) return;
  const role = readStoredUser()?.role;
  localStorage.removeItem("auth_user");
  window.location.href = loginPathFor(role);
}

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = readStoredUser()?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) handleUnauthorized(error.config?.url);
    return Promise.reject(error);
  }
);

export function installAuthFetch() {
  if (window.__authFetchInstalled) return;
  window.__authFetchInstalled = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (!url.startsWith(API_BASE)) return originalFetch(input, init);

    const headers = new Headers(init.headers || {});
    const token = readStoredUser()?.access_token;
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const res = await originalFetch(input, { ...init, headers });
    if (res.status === 401) handleUnauthorized(url);
    return res;
  };
}

export default api;