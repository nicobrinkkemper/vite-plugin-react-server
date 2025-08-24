import type {
  HtmlComponentType,
  PageComponentType,
  PagePropOpt,
  ResolvedUserOptions,
  RootComponentType,
} from "../../types.js";
import { createRscWorkerLoader } from "./createRscWorkerLoader.js";
import type { Logger } from "vite";
import type { RscRenderMessage } from "./types.js";
import type { React } from "../../vendor/vendor.server.js";
import {
  validateRscRenderMessage,
  resolveRenderUrl,
  mergeMessageWithDefaults,
  resolveWithDefaultRootAndHtml,
  logRenderStart,
} from "../../helpers/index.js";

/**
 * Creates the RSC worker loader with necessary configuration
 */
function createLoader(
  verbose: boolean,
  logger: Logger,
  hmrState: Map<string, { invalidated: boolean }>,
  projectRoot: string,
  build: any,
  manifest: Record<string, { file: string } | string>,
  clientPattern?: RegExp
) {
  return createRscWorkerLoader({
    verbose,
    logger,
    hmrState,
    projectRoot,
    build,
    manifest,
    clientPattern,
  });
}

/**
 * Main function that hydrates an RSC render message with all necessary context
 * 
 * This function orchestrates the process of preparing a render message for execution
 * by validating, resolving URLs, merging defaults, and setting up components and loaders.
 */
export function hydrateRscRenderMessage(
  {
    message,
    pageProps,
    PageComponent,
    RootComponent,
    HtmlComponent,
    userOptions,
    logger,
    hmrState,
    manifest,
  }: {
    message: RscRenderMessage;
    pageProps: PagePropOpt;
    PageComponent: PageComponentType<PagePropOpt>;
    RootComponent: RootComponentType | typeof React.Fragment;
    HtmlComponent: HtmlComponentType | typeof React.Fragment | undefined;
    userOptions: ResolvedUserOptions;
    logger: Logger;
    hmrState: Map<string, { invalidated: boolean }>;
    manifest: Record<string, { file: string } | string>;
  },
  // defaults
  { userOptions: defaultUserOptions = {} }: any = {}
) {
  // Step 1: Validate the message type
  validateRscRenderMessage(message);

  // Step 2: Resolve the URL for this render operation
  const url = resolveRenderUrl(message, userOptions);

  // Step 3: Merge message values with defaults
  const mergedValues = mergeMessageWithDefaults(message, defaultUserOptions);

  // Step 4: Log render start if verbose
  logRenderStart(mergedValues.route, mergedValues.verbose, logger, "rsc-worker");

  // Step 5: Resolve components with fallbacks
  const { RootComponent: resolvedRootComponent, HtmlComponent: resolvedHtmlComponent } = 
    resolveWithDefaultRootAndHtml(RootComponent, HtmlComponent);

  // Step 6: Create the loader
  const loader = createLoader(
    mergedValues.verbose,
    logger,
    hmrState,
    mergedValues.projectRoot,
    mergedValues.build,
    manifest,
    userOptions.autoDiscover?.clientPattern
  );

  // Step 7: Return the fully hydrated render context
  return {
    ...mergedValues,
    url,
    pageProps,
    RootComponent: resolvedRootComponent,
    HtmlComponent: resolvedHtmlComponent,
    PageComponent,
    loader,
    normalizer: userOptions.normalizer,
    moduleID: userOptions.moduleID,
    logger,
    autoDiscover: userOptions.autoDiscover,
    onMetrics: undefined,
    // Preserve CSS-related properties from the original message
    cssFiles: message.cssFiles,
    globalCss: message.globalCss,
    // Ensure build.pages is a string array for worker compatibility
    build: {
      ...mergedValues.build,
      pages: Array.isArray(mergedValues.build.pages) 
        ? mergedValues.build.pages 
        : [],
    },
  };
}
