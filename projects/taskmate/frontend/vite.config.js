// Vite config for frontend dev server and React plugin setup.
// ========================
// Imports
// ========================
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ========================
// Build/dev config
// ========================
export default defineConfig({
  // Enable JSX transform + React Fast Refresh.
  plugins: [react()],
  server: {
    // Keep frontend fixed to 5174 so backend CORS and run.sh stay aligned.
    port: 5174,
    strictPort: true
  }
});
