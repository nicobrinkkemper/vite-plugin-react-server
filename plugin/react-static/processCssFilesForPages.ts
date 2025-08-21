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
  serverManifest: Manifest | undefined;
  staticManifest: Manifest | undefined;
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
  const transformedServerManifest = Object.fromEntries(
    Object.entries(serverManifest ?? {}).map(([key, value]) => {
      const manifestEntry = value as any;
      if (!manifestEntry.css?.length) {
        return [key, value];
      }
      return [
        key,
        {
          ...manifestEntry,
          css:
            staticManifest?.[key]?.css ?? manifestEntry.css,
        },
      ];
    })
  );
  const globalCss = new Map();
  const { urlMap = new Map() } = autoDiscoveredFiles ?? {};

  // Create unified CSS processor
  const cssProcessor = createUnifiedCssProcessor({
    userOptions,
    logger,
    verbose: userOptions.verbose,
    staticOutDir: staticManifest ? join(userOptions.build.outDir, userOptions.build.static) : undefined,
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
