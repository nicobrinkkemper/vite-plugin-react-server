import { resolve } from "node:path";
import type { CreateHandlerOptions } from "../types.js";
import { type Connect } from "vite";
import { MIME_TYPES } from "../config/mimeTypes.js";
import { requestToRoute } from "./requestToRoute.js";
import { routeToURL } from "../utils/routeToURL.js";

/**
 * # Request info
 *
 * Does the initial work to check if the request is for html, rsc, json, js, css, server-action, or something else not handled by this plugin.
 *
 * @param req
 * @param handlerOptions
 * @param hostDir
 * @returns
 */
export function requestInfo(
  req: Connect.IncomingMessage,
  handlerOptions: Pick<
    CreateHandlerOptions,
    | "normalizer"
    | "build"
    | "autoDiscover"
    | "verbose"
    | "moduleBasePath"
    | "moduleBaseURL"
    | "verbose"
    | "logger"
  >,
  hostDir: string,
) {
  const route = requestToRoute(req, {
    moduleBasePath: handlerOptions.moduleBasePath,
    moduleBaseURL: handlerOptions.moduleBaseURL,
    build: handlerOptions.build,
  });

  if (!route) {
    return {
      route: "/",
      url: routeToURL("/", handlerOptions.moduleBaseURL, handlerOptions.build.rscOutputPath),
      ext: "",
    };
  }

  // Use the cleaned route for normalization, not the raw req.url
  // This ensures base URL is properly stripped before normalization
  const [, value] = handlerOptions.normalizer(route);
  if (handlerOptions.verbose) {
    if (value && value !== "") {
      handlerOptions.logger.info(`[requestInfo] Value: \"${value}\"`);
    }
    if (hostDir && hostDir !== "") {
      handlerOptions.logger.info(`[requestInfo] Host Dir: \"${hostDir}\"`);
    }
    if (req.url && req.url !== "") {
      handlerOptions.logger.info(`[requestInfo] Request URL: \"${req.url}\"`);
    }
  }

  const dotIndex = value.lastIndexOf(".");
  const ext = dotIndex === -1 ? "" : value.slice(dotIndex);
  // handle index.html
  const isVendor = handlerOptions.autoDiscover.vendorPattern.test(value);
  const isVirtual = handlerOptions.autoDiscover.virtualPattern.test(value);
  const isJS = handlerOptions.autoDiscover.modulePattern.test(value);
  const isHtml = handlerOptions.autoDiscover.htmlPattern.test(value);
  const isCss = handlerOptions.autoDiscover.cssPattern.test(value);
  const isJson = handlerOptions.autoDiscover.jsonPattern.test(value);
  const isRsc = handlerOptions.autoDiscover.rscPattern.test(value);
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
        handlerOptions.build.htmlOutputPath
      );
    }
    contentType = "text/html; charset=utf-8";
  } else if (isRscRequest) {
    if (!isRsc) {
      // Value doesn't end with .rsc, append the rsc output path
      filePath = resolve(
        hostDir,
        routeForFilePath,
        handlerOptions.build.rscOutputPath
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

  if (handlerOptions.verbose) {
    if (isFormActionRequest) {
      handlerOptions.logger.info(`[react-dev-server] (form-action) ${route}`);
    } else if (isServerActionRequest) {
      handlerOptions.logger.info(`[react-dev-server] (server-action) ${route}`);
    } else if (isHtmlRequest) {
      handlerOptions.logger.info(`[react-dev-server] (html) ${route}`);
    } else if (isRscRequest) {
      handlerOptions.logger.info(`[react-dev-server] (rsc) ${route}`);
    } else if (isCssRequest) {
      handlerOptions.logger.info(`[react-dev-server] (css) ${route}`);
    } else if (isJsRequest) {
      handlerOptions.logger.info(`[react-dev-server] (js) ${route}`);
    } else if (isJsonRequest) {
      handlerOptions.logger.info(`[react-dev-server] (json) ${route}`);
    } else {
      handlerOptions.logger.info(`[react-dev-server] (other) ${route}`);
    }
  }
  return {
    route,
    url: routeToURL(route, handlerOptions.moduleBaseURL, handlerOptions.build.rscOutputPath),
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
