import type { ViteDevServer } from "vite";
import { createDevMiddleware, type DevMiddlewareOptions } from "./createDevMiddleware.js";

export function createDevServer(
  server: ViteDevServer,
  options: DevMiddlewareOptions
) {
  server.middlewares.use(createDevMiddleware(server, options));
}
