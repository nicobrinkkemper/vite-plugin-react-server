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
      console.log("no url")
      return next();
    }
    const [withoutQuery] = req.url.split("?");
    const [, value] = userOptions.normalizer(withoutQuery);
    const ext = value.slice(value.lastIndexOf("."));
    // handle index.html
    const isHtml = userOptions.autoDiscover.htmlPattern(value)
    if (isHtml || (req.headers.accept?.includes("text/html"))) {
      const indexHtml = isHtml ? join(staticHostDir, value) : join(staticHostDir, value, userOptions.build.htmlOutputPath);
      console.log("is html", indexHtml)
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
    if (isRsc || (req.headers.accept?.includes("text/x-component"))) {
      const rsc = isRsc ? join(staticHostDir, value) : join(staticHostDir, value, userOptions.build.rscOutputPath);
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
    const isCss = userOptions.autoDiscover.cssPattern(value)
    if (isCss || (req.headers.accept?.includes("text/css") && (ext === ""))) {
      const css = isCss ? join(staticHostDir, value) : join(staticHostDir, value);
      try {
        const stats = await stat(css);
        if (stats.isFile()) {
          res.setHeader("Content-Type", "text/css; charset=utf-8");
          await pipeline(createReadStream(css), res);
          return;
        }
      } catch {
        // File doesn't exist, continue to next middleware
      }
    }
    // Handle static files including CSS
    if (ext) {
      const filePath = join(staticHostDir, value);
      try {
        const stats = await stat(filePath);
        if (stats.isFile()) {
          // Set proper MIME type based on file extension
          const contentType = MIME_TYPES[ext];
          // Ensure CSS files are served with the correct MIME type
          if (contentType) {
            res.setHeader("Content-Type", `${contentType}; charset=utf-8`);
          } else {
            res.setHeader("Content-Type", "application/octet-stream");
          }
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
