import type { PreviewServer } from "vite";
import { MIME_TYPES } from "../config/mimeTypes.js";
import type { ResolvedUserOptions } from "../types.js";
import { join } from "node:path";
import { stat, readFile } from "node:fs/promises";

export async function configurePreviewServer({
  server,
  userOptions,
}: {
  server: PreviewServer;
  userOptions: ResolvedUserOptions;
}) {
  const staticHostDir = join(userOptions.projectRoot, userOptions.build.outDir, userOptions.build.static);
  server.middlewares.use(async (req, res, next) => {
    if(!req.url) {
      return next();
    }
    const [, value] = userOptions.normalizer(req.url);
    try {
      const stats = await stat(join(staticHostDir, value));
      if (stats.isFile()) {
        const ext = value.slice(value.lastIndexOf("."));
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        res.setHeader("Content-Type", contentType);
        const content = await readFile(join(staticHostDir, value));
        res.end(content);
        return;
      }
      next();
    } catch (error) {
      console.log("error", error);
      server.config.logger.error("Error serving static file", {
        error: error instanceof Error ? error : new Error(),
      });
      next();
    }
  });
}
