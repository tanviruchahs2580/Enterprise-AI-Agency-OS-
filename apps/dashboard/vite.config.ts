import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.API_URL ?? "http://127.0.0.1:3000",
        changeOrigin: false,
      },
      "/health": {
        target: process.env.API_URL ?? "http://127.0.0.1:3000",
        changeOrigin: false,
      },
      "/ready": {
        target: process.env.API_URL ?? "http://127.0.0.1:3000",
        changeOrigin: false,
      },
      "/live": {
        target: process.env.API_URL ?? "http://127.0.0.1:3000",
        changeOrigin: false,
      },
      "/metrics": {
        target: process.env.API_URL ?? "http://127.0.0.1:3000",
        changeOrigin: false,
      },
    },
  },
  build: { outDir: "dist", sourcemap: true },
});
