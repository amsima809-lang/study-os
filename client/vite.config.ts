import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { APP_NAME } from "./src/brand.ts";

// Where the built app will be served: "/" (the default) or a sub-path. Build with
// BASE_PATH=/termtrail to serve it at https://example.com/termtrail; the server reads
// the same variable (server/src/env.ts).
const base = `/${(process.env.BASE_PATH ?? "").replace(/^\/+|\/+$/g, "")}/`.replace("//", "/");

// Client dev server runs on 5180 and proxies /api to the backend on 3100,
// so both can run together with one `npm run dev`.
export default defineConfig({
  base,
  plugins: [
    // The page title and home-screen title take the product's name from src/brand.ts.
    { name: "app-name", transformIndexHtml: (html: string) => html.replaceAll("%APP_NAME%", APP_NAME) },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png", "favicon-32x32.png", "favicon.svg"],
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        description: "เส้นทางสู่ปริญญาที่นำทางให้คุณ ม.รามคำแหง",
        lang: "th",
        theme_color: "#4f46e5",
        background_color: "#f8fafc",
        display: "standalone",
        start_url: base,
        scope: base,
        // "Share → StudyOS" from other apps (installed app only). Text, links,
        // photos and documents arrive as a form POST to /share, which the service
        // worker takes in (public/share-sw.js); client/src/shareIntake.ts then
        // turns them into a new note or a Library upload.
        share_target: {
          action: `${base}share`,
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
        // The local diagram renderer loads on demand only when opening a sketchnote.
        globIgnores: ["**/mermaid.tiny*.js", "**/node_modules/**/*", "**/sw.js", "**/workbox-*.js"],
        // Extra code for the generated worker: receiving "Share → StudyOS" (see
        // share_target above), and showing notifications when the app is closed.
        importScripts: ["share-sw.js", "push-sw.js"],
        navigateFallback: "index.html",
        // The worker answers a page visit with the app itself, so the app opens offline. But
        // not every visit is to a page of the app: "Sign in with Google" is a visit to
        // /api/auth/google, and so are its return, a calendar export and an uploaded file.
        // Those must reach the server. Without this line the worker answered them with the
        // app, and the Google button only reloaded the login page.
        // (and the calendar feed, /cal/<token>.ics, which a browser may open to subscribe)
        navigateFallbackDenylist: [/\/api\//, /\/cal\//],
        // Show last-known data offline for the Today and Review screens.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              // (this function is copied into the worker as text, so it cannot use `base`)
              url.pathname.endsWith("/api/today") || url.pathname.endsWith("/api/flashcards/due"),
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
