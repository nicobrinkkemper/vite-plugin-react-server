import { resolve } from "node:path";
import type { ResolvedUserOptions } from "../types.js";
import { createLogger, type Connect, type Logger } from "vite";
import { MIME_TYPES } from "../config/mimeTypes.js";
import { requestToRoute } from "./requestToRoute.js";

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
    | "normalizer"
    | "build"
    | "autoDiscover"
    | "verbose"
    | "moduleBasePath"
    | "moduleBaseURL"
    | "verbose"
  >,
  hostDir: string,
  logger: Logger = createLogger()
) {
  const route = requestToRoute(req, {
    moduleBasePath: userOptions.moduleBasePath,
    moduleBaseURL: userOptions.moduleBaseURL,
    build: userOptions.build,
  });

  if (!route) {
    return {
      route: "/",
      ext: "",
    };
  }

  // Use the cleaned route for normalization, not the raw req.url
  // This ensures base URL is properly stripped before normalization
  const [, value] = userOptions.normalizer(route);
  if (userOptions.verbose) {
    if (value && value !== "") {
      logger.info(`[requestInfo] Value: \"${value}\"`);
    }
    if (hostDir && hostDir !== "") {
      logger.info(`[requestInfo] Host Dir: \"${hostDir}\"`);
    }
    if (req.url && req.url !== "") {
      logger.info(`[requestInfo] Request URL: \"${req.url}\"`);
    }
  }

  const dotIndex = value.lastIndexOf(".");
  const ext = dotIndex === -1 ? "" : value.slice(dotIndex);
  // handle index.html
  const isVendor = userOptions.autoDiscover.vendorPattern.test(value);
  const isVirtual = userOptions.autoDiscover.virtualPattern.test(value);
  const isJS = userOptions.autoDiscover.modulePattern.test(value);
  const isHtml = userOptions.autoDiscover.htmlPattern.test(value);
  const isCss = userOptions.autoDiscover.cssPattern.test(value);
  const isJson = userOptions.autoDiscover.jsonPattern.test(value);
  const isRsc = userOptions.autoDiscover.rscPattern.test(value);
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

  // Server action detection
  const hasServerActionHeaders =
    req.method === "POST" &&
    (req.headers["sec-fetch-dest"] === "empty" ||
      req.headers["sec-fetch-dest"] === "") &&
    req.headers["sec-fetch-mode"] === "cors";
  const isServerActionRequest = hasServerActionHeaders;

  const isFormActionRequest =
    !isServerActionRequest &&
    (req.method === "POST" ||
      (isFormContentType &&
        req.headers["sec-fetch-dest"] === "document" &&
        req.headers["sec-fetch-mode"] === "navigate"));

  const isJsRequest =
    !isFormActionRequest &&
    !isJson &&
    !isHtml &&
    !isCss &&
    !isRsc &&
    (isJS || hasJsHeader);
  const isJsonRequest = isJson || (hasJsonHeader && !isJsRequest);
  // Form action detection

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

  // Use the normalized value for file path construction
  // The normalizer should have already stripped base URLs properly
  const routeForFilePath = value;

  let filePath = resolve(hostDir, routeForFilePath);
  let contentType;
  if (isServerActionRequest) {
    // For server actions, we'll get the actual file path from the request body
    // The route is just a placeholder
    filePath = resolve(hostDir, routeForFilePath);
    contentType = "application/json; charset=utf-8";
  } else if (isHtmlRequest) {
    if (!isHtml) {
      filePath = resolve(
        hostDir,
        routeForFilePath,
        userOptions.build.htmlOutputPath
      );
    }
    contentType = "text/html; charset=utf-8";
  } else if (isRscRequest) {
    if (!isRsc) {
      // Value doesn't end with .rsc, append the rsc output path
      filePath = resolve(
        hostDir,
        routeForFilePath,
        userOptions.build.rscOutputPath
      );
    }
    contentType = "text/x-component; charset=utf-8";
  } else if (isCssRequest) {
    if (!isCss) {
      filePath = resolve(hostDir, routeForFilePath + ".css");
    }
    contentType = "text/css; charset=utf-8";
  } else if (isJsRequest) {
    if (!isJS) {
      filePath = resolve(hostDir, routeForFilePath + ".js");
    }
    contentType = "application/javascript; charset=utf-8";
  } else if (isJsonRequest) {
    if (!isJson) {
      filePath = resolve(hostDir, routeForFilePath + ".json");
    }
    contentType = "application/json; charset=utf-8";
  } else {
    const mimeType = MIME_TYPES[ext];
    if (mimeType) {
      contentType = mimeType + "; charset=utf-8";
    } else {
      contentType = "application/octet-stream; charset=utf-8";
    }
  }

  if (userOptions.verbose) {
    if (isFormActionRequest) {
      logger.info(`[react-dev-server] (form-action) ${route}`);
    } else if (isServerActionRequest) {
      logger.info(`[react-dev-server] (server-action) ${route}`);
    } else if (isHtmlRequest) {
      logger.info(`[react-dev-server] (html) ${route}`);
    } else if (isRscRequest) {
      logger.info(`[react-dev-server] (rsc) ${route}`);
    } else if (isCssRequest) {
      logger.info(`[react-dev-server] (css) ${route}`);
    } else if (isJsRequest) {
      logger.info(`[react-dev-server] (js) ${route}`);
    } else if (isJsonRequest) {
      logger.info(`[react-dev-server] (json) ${route}`);
    } else {
      logger.info(`[react-dev-server] (other) ${route}`);
    }
  }
  return {
    route,
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
