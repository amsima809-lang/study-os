import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Client dev server runs on 5180 and proxies /api to the backend on 3100,
// so both can run together with one `npm run dev`.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png", "favicon-32x32.png"],
      manifest: {
        name: "StudyOS",
        short_name: "StudyOS",
        description: "ผู้ช่วยการเรียนส่วนตัว ม.รามคำแหง",
        lang: "th",
        theme_color: "#4f46e5",
        background_color: "#f8fafc",
        display: "standalone",
        start_url: "/",
        // "Share → StudyOS" from other apps (installed app only). Text, links,
        // photos and documents arrive as a form POST to /share, which the service
        // worker takes in (public/share-sw.js); client/src/shareIntake.ts then
        // turns them into a new note or a Library upload.
        share_target: {
          action: "/share",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            title: "share_title",
            text: "share_text",
            url: "share_url",
            files: [{ name: "files", accept: ["image/*", "application/pdf", "text/plain", ".pdf", ".txt"] }],
          },
        },
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        importScripts: ["share-sw.js"], // receives "Share → StudyOS" (see share_target above)
        navigateFallback: "/index.html",
        // Show last-known data offline for the Today and Review screens.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname === "/api/today" || url.pathname === "/api/flashcards/due",
            handler: "NetworkFirst",
            options: {
              cacheName: "studyos-api",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5180,
    proxy: {
      "/api": "http://localhost:3100",
    },
  },
});
