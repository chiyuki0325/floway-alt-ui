import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  ssr: {
    noExternal: ["@fluentui/react-icons"],
  },
  server: {
    proxy: {
      "/auth": {
        target: "https://***REMOVED***",
        changeOrigin: true,
        secure: true,
      },
      "/api": {
        target: "https://***REMOVED***",
        changeOrigin: true,
        secure: true,
      },
      "/v1": {
        target: "https://***REMOVED***",
        changeOrigin: true,
        secure: true,
      },
      "/anthropic": {
        target: "https://***REMOVED***",
        changeOrigin: true,
        secure: true,
      },
      "/gemini": {
        target: "https://***REMOVED***",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
