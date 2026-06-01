import type {
  AutoDiscoveredFiles,
  CssContent,
  ResolvedUserOptions,
} from "../types.js";
import type { Logger, Manifest } from "vite";
import { collectManifestCss } from "../helpers/collectManifestCss.js";
import { createUnifiedCssProcessor } from "../helpers/createUnifiedCssProcessor.js";
import { join } from "node:path";

interface ProcessCssFilesForPagesOptions {
  userOptions: ResolvedUserOptions;
  autoDiscoveredFiles: AutoDiscoveredFiles | null;
  staticManifest: Manifest | undefined;
  serverManifest: Manifest | undefined;
  bundle: any;
  logger: Logger;
}

export function processCssFilesForPages({
  userOptions,
  autoDiscoveredFiles,
  staticManifest,
  serverManifest,
  bundle,
  logger,
}: ProcessCssFilesForPagesOptions): {
  cssFilesByPage: Map<string, Map<string, CssContent>>;
  globalCss: Map<string, CssContent>;
} {
  const cssFilesByPage = new Map();

  // First collect global styles from index.html
  const indexHtmlCssInputs = collectManifestCss(
    staticManifest ?? {},
    "index.html"
  );
  const clientEntryCssInputs = userOptions.clientEntry
    ? collectManifestCss(
        staticManifest ?? {},
        userOptions.clientEntry
      )
    : null;
  const globalCssInputs = {
    ...indexHtmlCssInputs,
    ...clientEntryCssInputs,
  };

  // transform the server manifest to include the css files from the static manifest
  // The server manifest needs CSS info for inlining or requesting .js modules for classnames
  const transformedServerManifest = Object.fromEntries(
    Object.entries(serverManifest ?? {}).map(([key, value]) => {
      const manifestEntry = value as any;
      
      // If it's a bundle entry, just use the file property directly
      if (manifestEntry.isEntry && manifestEntry.file) {
        // Find the corresponding static manifest entry by matching the file path
        for (const [, staticValue] of Object.entries(staticManifest ?? {})) {
          if (staticValue && typeof staticValue === 'object' && 'file' in staticValue) {
            if (staticValue.file === manifestEntry.file && staticValue.css?.length) {
              return [
                key,
                {
                  ...manifestEntry,
                  css: staticValue.css,
                },
              ];
            }
          }
        }
      }
      
      return [key, value];
    })
  );
  const globalCss = new Map();
  const { urlMap = new Map() } = autoDiscoveredFiles ?? {};

  // Create unified CSS processor
  const cssProcessor = createUnifiedCssProcessor({
    userOptions,
    logger,
    verbose: userOptions.verbose,
    staticOutDir: staticManifest ? join(userOptions.projectRoot || '', userOptions.build.outDir, userOptions.build.client) : undefined,
    staticManifest,
    bundle,
  });

  // Collect CSS files for each page and its props
  for (const [url, { page, props }] of urlMap) {
    if (userOptions.verbose) {
      logger.info(
        `[plugin.server] Processing route: ${url}, page: ${page}, props: ${props}`
      );
    }
    // Use the transformed server manifest which now includes CSS info from the static manifest
    // This allows the server to inline CSS or request .js modules for classnames
    if (userOptions.verbose) {
      logger.info(`[plugin.server] transformedServerManifest keys: ${Object.keys(transformedServerManifest).join(', ')}`);
      logger.info(`[plugin.server] Looking for CSS starting from: ${page} and ${props || 'none'}`);
      if (transformedServerManifest[page]) {
        logger.info(`[plugin.server] Page entry: ${JSON.stringify(transformedServerManifest[page], null, 2)}`);
      }
      if (props && transformedServerManifest[props]) {
        logger.info(`[plugin.server] Props entry: ${JSON.stringify(transformedServerManifest[props], null, 2)}`);
      }
      
      // Debug: Check what CSS entries exist in the transformed manifest
      for (const [key, value] of Object.entries(transformedServerManifest)) {
        if (value && typeof value === 'object' && 'css' in value && Array.isArray(value.css) && value.css.length > 0) {
          logger.info(`[plugin.server] Found CSS entry: ${key} -> ${JSON.stringify(value.css)}`);
        }
      }
    }
    
    const cssInputs = collectManifestCss(
      transformedServerManifest,
      props ? [page, props] : page
    );
    if (userOptions.verbose) {
      logger.info(
        `[plugin.server] CSS inputs for ${url}: ${
          Object.keys(cssInputs).length
        } files`
      );
      for (const [key, value] of Object.entries(cssInputs)) {
        logger.info(`[plugin.server] CSS input: ${key} -> ${value}`);
      }
    }

    // Process CSS files using unified CSS processor
    const pageCssMap = cssProcessor.processCssFromStaticBuild(cssInputs);

    // Add global styles if they exist
    if (Object.keys(globalCssInputs).length > 0) {
      const globalCssMap = cssProcessor.processCssFromStaticBuild(globalCssInputs);
      for (const [key, value] of globalCssMap.entries()) {
        globalCss.set(key, value);
      }
    }
    cssFilesByPage.set(url, pageCssMap);
  }

  return {
    cssFilesByPage,
    globalCss,
  };
}
