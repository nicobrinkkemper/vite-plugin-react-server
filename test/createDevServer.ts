import { createServer } from "vite";
import type { Plugin, UserConfig, ViteDevServer } from "vite";
import { resolve } from "node:path";

export async function createDevServer({
  root,
  plugins,
  port,
  logLevel = "info",
  config = {},
}: {
  root: string;
  plugins: Plugin[];
  port?: number;
  logLevel?: UserConfig["logLevel"];
  config?: UserConfig;
}): Promise<ViteDevServer> {
  const server = await createServer({
    root,
    cacheDir: resolve(root, "node_modules/.vite"),
    plugins,
    logLevel,
    server: {
      port,
    },
    ...config,
  });

  await server.listen();
  return server;
}
