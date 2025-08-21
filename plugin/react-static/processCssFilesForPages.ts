import type {
  AutoDiscoveredFiles,
  CssContent,
  ResolvedUserOptions,
} from "../types.js";
import type { Logger, Manifest } from "vite";
import { collectManifestCss } from "../helpers/collectManifestCss.js";
import { createCssProps } from "../helpers/createCssProps.js";
import { readFileSync } from "node:fs";
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

    // Create a map for this page's CSS files
    const pageCssMap: Map<string, CssContent> = new Map();

    // Add global styles if they exist
    if (Object.keys(globalCssInputs).length > 0) {
      for (const [key] of Object.entries(globalCssInputs)) {
        // Get CSS content from bundle
        const bundleEntry = bundle[key];
        let cssContent = "";

        if (bundleEntry && bundleEntry.source) {
          cssContent = bundleEntry.source;
        }

        if (cssContent && typeof cssContent === "string") {
          globalCss.set(
            key,
            createCssProps({
              id: key,
              code: cssContent,
              userOptions: userOptions,
            })
          );
        }
      }
    }
    const cssBundleEntries = Object.entries(bundle).filter(
      ([, v]: [string, any]) => v?.type === "asset"
    ) as [
      string,
      {
        fileName: string;
        name: string;
        names: string[];
        needsCodeReference: boolean;
        source: string;
        type: "asset";
        originalFileName: string;
        originalFileNames: string[];
      }
    ][];
    // Add page-specific styles
    for (const [key] of Object.entries(cssInputs)) {
      if (userOptions.verbose) {
        logger.info(`[plugin.server] Loading CSS content for ${key}`);
      }

      // Debug bundle structure
      if (userOptions.verbose) {
        logger.info(
          `[plugin.server] Bundle keys: ${Object.keys(bundle).join(", ")}`
        );
        logger.info(`[plugin.server] Looking for CSS file: ${key}`);

        // Debug: show what's actually in the bundle for CSS files
        logger.info(
          `[plugin.server] CSS bundle entries: ${cssBundleEntries
            .map(([k]) => k)
            .join(", ")}`
        );

        // Show actual CSS content from bundle
        for (const [bundleKey, bundleValue] of cssBundleEntries) {
          logger.info(
            `[plugin.server] CSS bundle content for ${bundleKey}: preview="${bundleValue.source.substring(
              0,
              100
            )}"`
          );
        }
      }

      // Get CSS content from static build output files
      let cssContent = "";

      // Try to get CSS from static build output directory
      // CSS files are referenced by their hashed filename in the manifest
      if (staticManifest) {
        // Look for the CSS file directly in the static build output
        const cssFilePath = join(
          userOptions.build.outDir,
          userOptions.build.static,
          key
        );
        try {
          cssContent = readFileSync(cssFilePath, 'utf-8');
          if (userOptions.verbose) {
            logger.info(`[plugin.server] Got CSS from static build file: ${cssFilePath}`);
          }
        } catch (error) {
          if (userOptions.verbose) {
            logger.info(`[plugin.server] Failed to read CSS file: ${cssFilePath} - ${error}`);
          }
        }
      } else {
        if (userOptions.verbose) {
          logger.info(`[plugin.server] No static manifest available for CSS file: ${key}`);
        }
      }

      if (userOptions.verbose) {
        logger.info(
          `[plugin.server] CSS content for ${key}: ${typeof cssContent}, length: ${
            cssContent?.length
          }, preview: ${cssContent?.substring(0, 100)}`
        );
      }

      if (
        typeof cssContent !== "string" ||
        cssContent === "undefined" ||
        !cssContent
      ) {
        if (userOptions.verbose) {
          logger.info(
            `[plugin.server] Skipping CSS file ${key} - invalid content`
          );
        }
        continue;
      }

      if (cssContent) {
        // Ensure the CSS file path is properly resolved
        pageCssMap.set(
          key,
          createCssProps({
            id: key,
            code: cssContent,
            userOptions: userOptions,
          })
        );
        if (userOptions.verbose) {
          logger.info(`[plugin.server] Added CSS file ${key} to pageCssMap`);
        }
      }
    }
    cssFilesByPage.set(url, pageCssMap);
  }

  return {
    cssFilesByPage,
    globalCss,
  };
}
