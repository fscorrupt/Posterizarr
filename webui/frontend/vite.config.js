import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // API Requests
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      // WebSocket
      "/ws": {
        target: "http://localhost:8000",
        ws: true,
      },
      // Assets
      "/assets": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      // Assets
      "/poster_assets": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      // Test-Bilder
      "/test": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
