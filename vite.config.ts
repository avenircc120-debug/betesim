import { defineConfig } from "vite";
    import react from "@vitejs/plugin-react-swc";
    import path from "path";
    import { VitePWA } from "vite-plugin-pwa";

    export default defineConfig(({ mode }) => ({
    esbuild: {
      drop: mode === "production" ? ["debugger"] : [],
      legalComments: "none",
    },
    server: {
      host: "::",
      port: 8080,
      hmr: { overlay: false },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.ico", "robots.txt", "logo.svg"],
        workbox: {
          // Nouveau cacheId pour forcer l'invalidation du cache HTML corrompu
          // (les fonctions API retournaient du HTML avant le fix TypeScript).
          cacheId: "betesim-v2",
          skipWaiting: true,
          clientsClaim: true,
          // Exclut /api/ du navigateFallback (requêtes de navigation)
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          runtimeCaching: [
            {
              // On utilise une fonction car urlPattern reçoit l'URL ABSOLUE
              // ex: https://betesim.vercel.app/api/chap-money/checkout
              // Le pattern /^\/api\// ne matchait jamais → pas de NetworkOnly.
              urlPattern: ({ url }: { url: URL }) =>
                url.pathname.startsWith("/api/"),
              handler: "NetworkOnly",
            },
          ],
        },
        manifest: {
          name: "betesim",
          short_name: "betesim",
          description: "Numéros virtuels pour WhatsApp, TikTok, Instagram et plus encore",
          theme_color: "#6366f1",
          background_color: "#0f0f1a",
          display: "standalone",
          orientation: "portrait",
          start_url: "/",
          scope: "/",
          icons: [
            { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
            { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
      dedupe: ["react", "react-dom"],
    },
    build: {
      minify: "esbuild",
      rollupOptions: {
        output: {
          chunkFileNames: () => {
            const r = () => Math.random().toString(36).slice(2, 8);
            return `assets/${r()}${r()}-[hash].js`;
          },
          entryFileNames: `assets/[hash].js`,
          assetFileNames: `assets/[hash][extname]`,
        },
      },
      sourcemap: false,
      assetsInlineLimit: 0,
    },
    }));
    