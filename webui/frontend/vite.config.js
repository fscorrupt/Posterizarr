import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor dependencies into separate chunks
          "react-vendor": ["react", "react-dom"],
          "router-vendor": ["react-router-dom"],
          "ui-vendor": ["lucide-react", "react-hot-toast"],
        },
      },
    },
    // Optional: Increase the chunk size warning limit if needed
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 3000,
    proxy: {
      // API Requests
      "/api": {
        target: "",
        changeOrigin: true,
      },
      // WebSocket
      "/ws": {
        target: "",
        ws: true,
      },
      // Assets
      "/assets": {
        target: "",
        changeOrigin: true,
      },
      // Assets
      "/poster_assets": {
        target: "",
        changeOrigin: true,
      },
      // Test-Bilder
      "/test": {
        target: "",
        changeOrigin: true,
      },
    },
  },
});
