import axios from "axios";

// In Electron the preload exposes the local backend port; otherwise use the
// backend URL baked in at build time (Render/production). When running from
// file:// we must point to the deployed backend (no local server).
const electronPort = typeof window !== "undefined" && window.electronAPI?.backendPort;

// If running from file:// (the page is opened directly from disk) use the
// deployed backend URL so the static file can contact the live API.
const isFileProtocol = typeof window !== "undefined" && window.location.protocol === "file:";

// Default production backend URL (the deployed API).
const PROD_BACKEND = "https://robohub2026.onrender.com";

const BACKEND_URL = isFileProtocol
  ? PROD_BACKEND
  : electronPort
  ? `http://127.0.0.1:${electronPort}`
  : process.env.REACT_APP_BACKEND_URL || PROD_BACKEND;

const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("rh_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const BACKEND_API = API;

// Fire-and-forget ping to wake the Render free-tier backend on page load.
api.get("/").catch(() => {});

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
