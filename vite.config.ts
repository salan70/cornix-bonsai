import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createApiHandler, createLocalApi } from "./src/server/api.ts";
import { defaultWorkspaceRoot } from "./src/workspace/default-root.ts";

/** `just dev` の固定の bind と port。API の origin 検査に使う（ADR 0038）。 */
const DEV_HOST = "127.0.0.1";
const DEV_PORT = 5173;

/**
 * `just ui` と同じ `/api/` を開発サーバーへ載せる。Web UI は workspace をこの API でしか
 * 読めないため、開発サーバーにも要る。
 */
function localApi(): Plugin {
  return {
    name: "keysync-local-api",
    apply: "serve",
    configureServer(server) {
      const root = defaultWorkspaceRoot();
      const handle = createApiHandler({
        origin: `http://${DEV_HOST}:${DEV_PORT}`,
        api: createLocalApi(root),
      });
      server.middlewares.use((request, response, next) => {
        if ((request.url ?? "").startsWith("/api/")) handle(request, response);
        else next();
      });
      server.config.logger.info(`  keysync: workspace は ${root}`);
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [react(), localApi()],
  server: { host: DEV_HOST, port: DEV_PORT, strictPort: true },
});
