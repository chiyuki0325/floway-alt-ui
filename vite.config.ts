import { reactRouter } from "@react-router/dev/vite";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

function prismComponentsEsm(): Plugin {
  return {
    name: "prism-components-esm",
    enforce: "pre",
    transform(code, id) {
      const path = id.split("?", 1)[0]?.replaceAll("\\", "/");
      if (!path || !/\/prismjs\/components\/prism-[^/]+\.js$/.test(path)) return;

      return `import Prism from "prismjs";\n${code}`;
    },
  };
}

export default defineConfig({
  plugins: [prismComponentsEsm(), UnoCSS({ mode: "per-module" }), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  environments: {
    client: {
      build: {
        rolldownOptions: {
          output: {
            codeSplitting: {
              groups: [
                {
                  name: "ai",
                  test: /node_modules[\\/](?:\.pnpm[\\/])?(?:@ai-sdk\+|ai@|@ai-sdk[\\/]|ai[\\/])/,
                  priority: 40,
                },
                {
                  name: "fluent",
                  test: /node_modules[\\/](?:\.pnpm[\\/])?(?:@fluentui\+|@griffel\+|tabster@|@fluentui[\\/]|@griffel[\\/]|tabster[\\/])/,
                  priority: 30,
                },
                {
                  name: "react-runtime",
                  test: /node_modules[\\/](?:\.pnpm[\\/])?(?:react(?:-dom|-router)?@|scheduler@|react(?:-dom|-router)?[\\/]|scheduler[\\/])/,
                  priority: 20,
                },
                {
                  name: "vendor",
                  test: /node_modules/,
                  priority: 10,
                },
                {
                  name: "app",
                  test: /[\\/]app[\\/]/,
                  priority: 5,
                },
              ],
            },
          },
        },
      },
    },
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
