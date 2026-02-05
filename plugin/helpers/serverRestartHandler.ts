import type { ViteDevServer } from "vite";

export function setupServerRestartHandler(
  server: ViteDevServer,
  onRestart: (path?: string) => Promise<void> | void,
  logMessage?: string
) {
  server.ws.on("restart", async (path) => {
    if (logMessage) {
      server.config.logger.info(logMessage, path);
    }
    await onRestart(path);
  });
}
