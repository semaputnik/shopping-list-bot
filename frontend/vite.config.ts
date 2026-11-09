import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev the backend runs on :8000 (see CLAUDE.md); in production it serves dist/ itself.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8000" } },
});
