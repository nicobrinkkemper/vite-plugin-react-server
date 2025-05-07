import type { PreviewServer } from "vite";
import { MIME_TYPES } from "../config/mimeTypes.js";
import type { ResolvedUserOptions } from "../types.js";
import { join } from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

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
    // handle index.html
    const isHtml = userOptions.autoDiscover.htmlPattern(value)
    if (isHtml || req.headers.accept?.includes("text/html")) {
      const indexHtml = isHtml ? join(staticHostDir, value) : join(staticHostDir, value, "index.html");
      try {
        const stats = await stat(indexHtml);
        if (stats.isFile()) {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          await pipeline(createReadStream(indexHtml), res);
          return;
        }
      } catch {
        // File doesn't exist, continue to next middleware
      }
    } 
    const isRsc = userOptions.autoDiscover.rscPattern(value)
    if (isRsc || req.headers.accept?.includes("text/x-component")) {
      const rsc = isRsc ? join(staticHostDir, value) : join(staticHostDir, value, "index.rsc");
      try {
        const stats = await stat(rsc);
        if (stats.isFile()) {
          res.setHeader("Content-Type", "text/x-component; charset=utf-8");
          await pipeline(createReadStream(rsc), res);
          return;
        }
      } catch {
        // File doesn't exist, continue to next middleware
      }
    }
    const ext = value.slice(value.lastIndexOf("."));
    if (ext) {
      const filePath = join(staticHostDir, value);
      try {
        const stats = await stat(filePath);
        if (stats.isFile()) {
          const contentType = MIME_TYPES[ext] || "application/octet-stream";
          res.setHeader("Content-Type", `${contentType}; charset=utf-8`);
          await pipeline(createReadStream(filePath), res);
          return;
        }
      } catch {
        // File doesn't exist, continue to next middleware
      }
    }
    next();
  });
}
