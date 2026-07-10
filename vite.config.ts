import { reactRouter } from "@react-router/dev/vite";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [UnoCSS({ mode: "per-module" }), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    proxy: {
      "/auth": {
        target: "http://aperturius.chyk.ink:8788",
        changeOrigin: true,
        secure: true,
      },
      "/api": {
        target: "http://aperturius.chyk.ink:8788",
        changeOrigin: true,
        secure: true,
      },
      "/v1": {
        target: "http://aperturius.chyk.ink:8788",
        changeOrigin: true,
        secure: true,
      },
      "/anthropic": {
        target: "http://aperturius.chyk.ink:8788",
        changeOrigin: true,
        secure: true,
      },
      "/gemini": {
        target: "http://aperturius.chyk.ink:8788",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
