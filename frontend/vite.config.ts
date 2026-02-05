import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy auth + API calls to the local Express backend in dev to avoid CORS.
      "/login": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        bypass: (req) => {
          if (req.method === "GET") {
            return req.url;
          }
          return null;
        },
      },
      "/logout": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
      "/_agents": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
      "/ws": {
        // backend WebSocket is mounted at /ws/stream
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
