import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // ✅ prevents "useContext null" + duplicated React issues (Recharts/ResponsiveContainer)
  resolve: {
    dedupe: ["react", "react-dom"],
  },

  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
      },
      // Optional: only needed if your frontend calls /auth directly (not /api/auth)
      "/auth": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
