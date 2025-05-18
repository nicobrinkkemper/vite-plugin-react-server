import { join } from "node:path";
import type { ResolvedUserOptions } from "../types.js";
import type { Connect } from "vite";
import { MIME_TYPES } from "../config/mimeTypes.js";

/**
 * # Request info
 * 
 * Does the initial work to check if the request is for html, rsc, css, or something else not handled by this plugin.
 * 
 * @param req 
 * @param userOptions 
 * @param hostDir 
 * @returns 
 */
export function requestInfo(
  req: Connect.IncomingMessage,
  userOptions: Pick<ResolvedUserOptions, "normalizer" | "build" | "autoDiscover">,
  hostDir: string
) {
  const [, value] = userOptions.normalizer(req.url);
  const dotIndex = value.lastIndexOf(".");
  const ext = dotIndex === -1 ? "" : value.slice(dotIndex);
  // handle index.html
  const isHtml = userOptions.autoDiscover.htmlPattern(value);
  const hasHtmlHeader = req.headers.accept?.includes("text/html");
  const isRsc = userOptions.autoDiscover.rscPattern(value);
  const hasRscHeader = req.headers.accept?.includes("text/x-component");
  const isFolder = !ext;
  const isHtmlRequest =
    isHtml || hasHtmlHeader || (isFolder && !hasRscHeader && !isRsc);
  const isRscRequest = !isHtmlRequest && (isRsc || hasRscHeader);
  const isCss = userOptions.autoDiscover.cssPattern(value);
  const isCssRequest =
    !isHtmlRequest &&
    !isRscRequest &&
    (isCss || req.headers.accept?.includes("text/css"));
  let filePath = join(hostDir, value);
  let contentType;
  if (isHtmlRequest) {
    if (!isHtml) {
      filePath = join(hostDir, value, userOptions.build.htmlOutputPath);
    }
    contentType = "text/html; charset=utf-8";
  } else if (isRscRequest) {
    if (!isRsc) {
      filePath = join(hostDir, value, userOptions.build.rscOutputPath);
    }
    contentType = "text/x-component; charset=utf-8";
  } else if (isCssRequest) {
    if (!isCss) {
      filePath = join(hostDir, value);
    }
    contentType = "text/css; charset=utf-8";
  } else {
    const mimeType = MIME_TYPES[ext];
    if (mimeType) {
      contentType = mimeType;
    } else {
      contentType = "application/octet-stream";
    }
  }
  const route = value
    .replace(userOptions.build.rscOutputPath, "")
    .replace(userOptions.build.htmlOutputPath, "");
    
  const routeWithoutTrailingSlash =
    route === "" || route === "/"
      ? "/"
      : route.endsWith("/")
      ? route.slice(0, -1)
      : route;
  const routeWithLeadingSlash =
    routeWithoutTrailingSlash.startsWith("/")
      ? routeWithoutTrailingSlash
      : `/${routeWithoutTrailingSlash}`;

  return {
    route: routeWithLeadingSlash,
    ext,
    isHtmlRequest,
    isRscRequest,
    isCssRequest,
    isCss,
    isHtml,
    isRsc,
    isFolder,
    contentType,
    filePath,
  };
}
