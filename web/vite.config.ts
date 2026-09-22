import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const base = env.VITE_BASE_PATH || "/";
  const outDir = env.VITE_OUT_DIR || "dist";
  const proxyTarget = env.VITE_API_PROXY_TARGET || "http://localhost:3000";

  return {
    base,
    plugins: [vue()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      proxy: {
        "/api/auth": { target: proxyTarget, changeOrigin: true },
        "/account": { target: proxyTarget, changeOrigin: true },
        "/jarvis": { target: proxyTarget, changeOrigin: true },
        "/inbox-zero": { target: proxyTarget, changeOrigin: true },
        "/auth": { target: proxyTarget, changeOrigin: true },
      },
    },
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
