import { createServer } from "vite";
import type { StreamPluginOptions} from "vite-plugin-react-server/types";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import type { ViteDevServer } from "vite";
import { join } from "node:path";

let servers: Record<number, ViteDevServer> = {};

/**
 * Clears the server cache for a specific port or all ports
 */
export function clearServerCache(port?: number) {
  if (port !== undefined) {
    delete servers[String(port)];
  } else {
    servers = {};
  }
}

/**
 * Starts a dev server with the test config and given options
 * @param optionOverrides - Optional overrides for the options
 * @returns The Vite dev server instance
 */
export async function createClientDevServer(optionOverrides: Partial<StreamPluginOptions> = {}, port = 5175) {
  const portKey = String(port);
  
  // Check if we have a cached server for this port
  if (servers[portKey]) {
    const cachedServer = servers[portKey];
    
    // Verify the server is still running by checking if it has a port
    if (cachedServer.config.server?.port) {
      return cachedServer;
    } else {
      // Server crashed or is in bad state, remove from cache
      delete servers[portKey];
    }
  }
  
  servers[portKey] = await createServer({
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
  
  await servers[portKey].listen();
  return servers[portKey];
} 