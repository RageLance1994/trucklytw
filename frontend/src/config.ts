const envBase = import.meta.env.VITE_API_BASE_URL;
const isDev = import.meta.env.DEV;

// In dev, default to same-origin ("") so Vite's proxy can avoid CORS.
// In prod, fall back to the public domain if not overridden.
export const API_BASE_URL = envBase ?? "";

// Default to the existing Express form endpoint `/login`.
export const LOGIN_PATH = import.meta.env.VITE_LOGIN_PATH || "/login";

export const VEHICLES_PATH =
  import.meta.env.VITE_VEHICLES_PATH || "/api/vehicles";

// Backend WebSocket route is mounted at /ws/stream (see backend/routes/_websockets.js).
export const WS_PATH = import.meta.env.VITE_WS_PATH || "/ws/stream";

export const WS_URL =
  import.meta.env.VITE_WS_URL ||
  // If API_BASE_URL is empty, this becomes a relative `/ws/stream` URL,
  // which Vite's proxy maps to the Express /ws/stream endpoint in dev.
  (API_BASE_URL
    ? `${API_BASE_URL.replace(/^http/, "ws")}${WS_PATH}`
    : WS_PATH);
