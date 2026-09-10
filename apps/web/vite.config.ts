import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    proxy: {
      "/v1": "http://localhost:7373",
      "/api": "http://localhost:7373",
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-markdown": ["react-markdown", "remark-gfm", "rehype-highlight", "highlight.js"],
          "vendor-charts": ["recharts"],
        },
      },
    },
  },
});
