import type { CreateHtmlStreamFn } from "./createHtmlStream.types.js";
import { assertNonReactServer } from "../config/getCondition.js";
import { createRenderToPipeableStreamHandler } from "./createRenderToPipeableStreamHandler.client.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

assertNonReactServer();

export const createHtmlStream: CreateHtmlStreamFn = function _createHtmlStream(
  options
) {
  // Client-side HTML streaming uses the unified renderToPipeableStream handler
  // This provides consistent behavior across client and server environments
  
  if (!options.children && !options.rscStream) {
    throw new Error(
      "either children or rscStream is required for HTML streaming on client"
    );
  }

  // The handler can handle both cases:
  // 1. If rscStream is provided, it will convert it to React elements
  // 2. If children is provided, it will use them directly
  // This replaces the original createFromNodeStream logic
  
  return createRenderToPipeableStreamHandler({
    prerender: options.prerender,
    route: options.route,
    logger: options.logger,
    verbose: options.verbose || DEFAULT_CONFIG.VERBOSE,
    panicThreshold: options.panicThreshold,
    htmlTimeout: options.htmlTimeout || DEFAULT_CONFIG.HTML_TIMEOUT,
    rscStream: options.rscStream,
    children: options.children,
    moduleRootPath: options.moduleRootPath,
    moduleBasePath: options.moduleBasePath,
    moduleBaseURL: options.moduleBaseURL,
    clientPipeableStreamOptions: options.clientPipeableStreamOptions,
    // Provide minimal required properties for the handler
    pageExportName: options.pageExportName,
    propsExportName: options.propsExportName, 
    rootExportName: options.rootExportName,
    htmlExportName: options.htmlExportName,
    moduleBase: options.moduleBase,
    publicOrigin: options.publicOrigin,
    projectRoot: options.projectRoot,
    url: options.url || "",
  });
};
