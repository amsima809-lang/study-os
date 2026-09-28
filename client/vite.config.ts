import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Client dev server runs on 5173 and proxies /api to the backend on 3000,
// so both can run together with one `npm run dev`.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    proxy: {
      "/api": "http://localhost:3100",
    },
  },
});
