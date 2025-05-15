import { createServer } from "vite";
import { vitePluginReactClient } from "../../dist/client";
import { testUserOptions } from "../test-config";
import type { ViteDevServer } from "vite";

/**
 * Starts a dev server with the test config and given options
 * @param optionOverrides - Optional overrides for the options
 * @returns The Vite dev server instance
 */
export async function doDevServer(optionOverrides: any = {}) {
  const server: ViteDevServer = await createServer({
    plugins: [vitePluginReactClient({
      ...testUserOptions,
      ...optionOverrides,
      build: {
        ...testUserOptions.build,
        ...optionOverrides?.build,
      },
      workerData: optionOverrides.workerData,
    })],
    logLevel: 'info'
  });

  await server.listen();
  console.log("Server is listening on port", server.config.server.port);
  return server;
} 