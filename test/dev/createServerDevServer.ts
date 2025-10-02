import { createServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server/server";
import { testUserOptions } from "../test-config";
import type { ViteDevServer } from "vite";
import { join } from "node:path";
import type { StreamPluginOptions } from "vite-plugin-react-server/types";

/**
 * Starts a dev server with the test config and given options
 * @param optionOverrides - Optional overrides for the options
 * @param port - Port to use for the server
 * @returns The Vite dev server instance
 */
export async function createServerDevServer(optionOverrides: Partial<StreamPluginOptions> = {}, port = 5175) {
  
  const server: ViteDevServer = await createServer({
    root: optionOverrides.projectRoot,
    plugins: [vitePluginReactServer({
      ...testUserOptions,
      ...optionOverrides,
    })],
    logLevel: 'info',
    server: {
      port: port,
    },
    // Use a unique cache directory to prevent race conditions
    cacheDir: join(process.cwd(), "node_modules", `.vite-test-${port}`),
  });
  
  await server.listen();
  return server;
} 