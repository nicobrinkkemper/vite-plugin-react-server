import { createServer } from "vite";
import type { StreamPluginOptions} from "vite-plugin-react-server/client";
import { vitePluginReactClient } from "vite-plugin-react-server/client";
import { testUserOptions } from "../test-config";
import type { ViteDevServer } from "vite";
import { join } from "node:path";

/**
 * Starts a dev server with the test config and given options
 * @param optionOverrides - Optional overrides for the options
 * @returns The Vite dev server instance
 */
export async function createClientDevServer(optionOverrides: Partial<StreamPluginOptions> = {}, port = 5175) {
  const server: ViteDevServer = await createServer({
    plugins: [vitePluginReactClient({
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
  return server
} 