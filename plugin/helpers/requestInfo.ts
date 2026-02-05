import { join, resolve } from "node:path";
import type { ResolvedUserOptions } from "../types.js";
import { createLogger, type Connect, type Logger } from "vite";
import { MIME_TYPES } from "../config/mimeTypes.js";

/**
 * # Request info
 *
 * Does the initial work to check if the request is for html, rsc, json, js, css, server-action, or something else not handled by this plugin.
 *
 * @param req
 * @param userOptions
 * @param hostDir
 * @returns
 */
export function requestInfo(
  req: Connect.IncomingMessage,
  userOptions: Pick<
    ResolvedUserOptions,
    "normalizer" | "build" | "autoDiscover" | "verbose"
  >,
  hostDir: string,
  logger: Logger = createLogger()
) {
  const [, value] = userOptions.normalizer(req.url);
  const dotIndex = value.lastIndexOf(".");
  const ext = dotIndex === -1 ? "" : value.slice(dotIndex);
  // handle index.html
  const isVendor = userOptions.autoDiscover.vendorPattern(value);
  const isVirtual = userOptions.autoDiscover.virtualPattern(value);
  const isJS = userOptions.autoDiscover.modulePattern(value);
  const isHtml = userOptions.autoDiscover.htmlPattern(value);
  const isCss = userOptions.autoDiscover.cssPattern(value);
  const isJson = userOptions.autoDiscover.jsonPattern(value);
  const isRsc = userOptions.autoDiscover.rscPattern(value);
  const isStaticAsset =
    !!ext &&
    !isJS &&
    !isCss &&
    !isHtml &&
    !isJson &&
    !isRsc &&
    !!MIME_TYPES[ext];
  const hasJsHeader =
    req.headers["sec-fetch-dest"] === "script" ||
    req.headers["accept"]?.includes("*/*") ||
    req.headers["accept"]?.includes("text/javascript");
  const hasJsonHeader = req.headers["accept"]?.includes("application/json");
  const hasHtmlHeader = req.headers.accept?.includes("text/html");
  const hasRscHeader = req.headers.accept?.includes("text/x-component");
  const hasCssHeader = req.headers.accept?.includes("text/css");
  const isFolder = !ext;
  const isFormContentType =
    req.headers["content-type"]?.includes(
      "application/x-www-form-urlencoded"
    ) || !!req.headers["content-type"]?.includes("multipart/form-data");
  
  // Form action detection
  const isFormActionRequest =
    req.method === "POST" &&
    (isFormContentType ||
      (req.headers["sec-fetch-dest"] === "document" &&
        req.headers["sec-fetch-mode"] === "navigate"));

  // Server action detection
  const hasServerActionHeaders =
    req.method === "POST" &&
    (req.headers["sec-fetch-dest"] === "empty" ||
      req.headers["sec-fetch-dest"] === "") &&
    req.headers["sec-fetch-mode"] === "cors";
  const isServerActionRequest =
    req.method === "POST" &&
    !isFormActionRequest &&
    (hasServerActionHeaders || hasRscHeader);

  const isJsRequest =
    !isFormActionRequest &&
    !isJson &&
    !isHtml &&
    !isCss &&
    !isRsc &&
    !isStaticAsset &&
    (isJS || hasJsHeader);
  const isJsonRequest = isJson || (hasJsonHeader && !isJsRequest);
  
  const isHtmlRequest =
    isHtml ||
    hasHtmlHeader ||
    (isFolder &&
      !hasRscHeader &&
      !isRsc &&
      !isJsRequest &&
      !isFormActionRequest);
  const isRscRequest =
    !isJsRequest && !isHtmlRequest && (isRsc || hasRscHeader);
  const isCssRequest =
    !isHtmlRequest &&
    !isRscRequest &&
    !isJsRequest &&
    !isJsonRequest &&
    (isCss || hasCssHeader);

  let filePath = join(hostDir, value);
  let contentType;
  if (isServerActionRequest) {
    // For server actions, we'll get the actual file path from the request body
    // The route is just a placeholder
    filePath = value;
    contentType = "application/json; charset=utf-8";
  } else if (isHtmlRequest) {
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
      filePath = join(hostDir, value + ".css");
    }
    contentType = "text/css; charset=utf-8";
  } else if (isJsRequest) {
    if (!isJS) {
      filePath = resolve(hostDir, value + ".js");
    }
    contentType = "application/javascript; charset=utf-8";
  } else if (isJsonRequest) {
    if (!isJson) {
      filePath = join(hostDir, value + ".json");
    }
    contentType = "application/json; charset=utf-8";
  } else {
    const mimeType = MIME_TYPES[ext];
    if (mimeType) {
      contentType = mimeType + "; charset=utf-8";
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

  const routeWithLeadingSlash = !routeWithoutTrailingSlash
    ? "/"
    : routeWithoutTrailingSlash.startsWith("/")
    ? routeWithoutTrailingSlash
    : `/${routeWithoutTrailingSlash}`;

  if (userOptions.verbose) {
    if (isFormActionRequest) {
      logger.info(`[react-dev-server] (form-action) ${routeWithLeadingSlash}`);
    } else if (isServerActionRequest) {
      logger.info(
        `[react-dev-server] (server-action) ${routeWithLeadingSlash}`
      );
    } else if (isHtmlRequest) {
      logger.info(`[react-dev-server] (html) ${routeWithLeadingSlash}`);
    } else if (isRscRequest) {
      logger.info(`[react-dev-server] (rsc) ${routeWithLeadingSlash}`);
    } else if (isCssRequest) {
      logger.info(`[react-dev-server] (css) ${routeWithLeadingSlash}`);
    } else if (isJsRequest) {
      logger.info(`[react-dev-server] (js) ${routeWithLeadingSlash}`);
    } else if (isJsonRequest) {
      logger.info(`[react-dev-server] (json) ${routeWithLeadingSlash}`);
    } else {
      logger.info(`[react-dev-server] (other) ${routeWithLeadingSlash}`);
    }
  }
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
    isJS,
    isVendor,
    isVirtual,
    hasJsHeader,
    isJsRequest,
    isJson,
    isJsonRequest,
    hasCssHeader,
    hasJsonHeader,
    hasHtmlHeader,
    hasRscHeader,
    hasServerActionHeaders,
    isServerActionRequest,
    isFormContentType,
    isFormActionRequest,
  };
}
