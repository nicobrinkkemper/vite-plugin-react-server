import { vitePluginReactClient } from "../../dist/client";
import { testUserOptions } from "../test-config";
import type { ViteDevServer } from "vite";
import { createDevServer } from "../createDevServer.js";

/**
 * Starts a dev server with the test config and given options
 * @param optionOverrides - Optional overrides for the options
 * @returns The Vite dev server instance
 */
export async function createClientDevServer(optionOverrides: any = {}, port = 5175) {
  const root =
    optionOverrides.projectRoot ??
    testUserOptions.projectRoot ??
    process.cwd();
  const server: ViteDevServer = await createDevServer({
    root,
    port,
    logLevel: "info",
    plugins: [
      vitePluginReactClient({
        ...testUserOptions,
        ...optionOverrides,
      }),
    ],
  });
  return server;
} 