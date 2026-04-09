import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
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
        navigateFallbackDenylist: [/^\/~oauth/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
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
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 3,
        dead_code: true,
        collapse_vars: true,
        reduce_vars: true,
        pure_funcs: ["console.log", "console.info", "console.warn", "console.error"],
        unsafe: true,
        unsafe_math: true,
        unsafe_proto: true,
      },
      mangle: {
        toplevel: true,
        eval: true,
        properties: {
          regex: /^_/,
        },
      },
      format: {
        comments: false,
        ascii_only: true,
        beautify: false,
        semicolons: true,
      },
    },
    rollupOptions: {
      output: {
        // Randomize chunk names so file structure is unpredictable
        chunkFileNames: () => {
          const r = () => Math.random().toString(36).slice(2, 8);
          return `assets/${r()}${r()}-[hash].js`;
        },
        entryFileNames: `assets/[hash].js`,
        assetFileNames: `assets/[hash][extname]`,
        // Split into many small chunks to make reverse-engineering harder
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react")) return "r";
            if (id.includes("radix")) return "x";
            if (id.includes("framer")) return "f";
            return "v";
          }
        },
      },
    },
    sourcemap: false,
    assetsInlineLimit: 0,
  },
}));
