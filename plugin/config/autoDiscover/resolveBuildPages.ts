import { access } from "node:fs/promises";
import { join } from "node:path";
import type {
  PageName,
  PropsName,
  ResolvedBuildPages,
  ResolvedUserOptions,
} from "../../types.js";
import { resolveUrlOption } from "../resolveUrlOption.js";
import type { Logger } from "vite";
import type { Manifest } from "vite";

let stashedBuildPages: ResolvedBuildPages | null = null;
let stashedPages: string[] | null = null;

// Helper function to resolve paths using manifest
function resolvePathWithManifest(path: string, manifest: Manifest): string {
  // Check if the path exists in the manifest
  const manifestEntry = manifest[path];
  if (manifestEntry && manifestEntry.file) {
    // Return the compiled file path
    return manifestEntry.file;
  }
  
  // If not found in manifest, return the original path
  return path;
}

/**
 * Resolves build pages by calling resolveUrlOption for each page in build.pages.
 *
 * ## BUILD-TIME STATIC DISCOVERY
 * This function is called during build/startup to:
 * 1. Take the explicit `build.pages` array (e.g., ["/", "/about", "/products"])
 * 2. Call `resolveUrlOption` for each page to get file paths
 * 3. Build static maps (urlMap, pageMap, propsMap, routeMap) for fast runtime lookup
 * 4. Validate that resolved file paths actually exist on filesystem
 *
 * ## Cache Strategy:
 * Results are cached (stashedBuildPages) to avoid re-resolving on every build.
 * Cache is invalidated only when the pages array changes.
 *
 * ## Usage Flow:
 * - Called by build process and plugin initialization
 * - Feeds into auto-discovery system to populate urlMap cache
 * - Enables fast runtime lookup in getRouteFiles.ts without dynamic resolution
 *
 * ## Limitation:
 * Only works when build.pages is explicitly provided. Without it, the system
 * falls back to filesystem scanning + dynamic resolution in getRouteFiles.ts.
 */
export async function resolveBuildPages({
  pages,
  userOptions,
  logger,
  manifest = {},
}: {
  pages: string[];
  userOptions: Pick<
    ResolvedUserOptions,
    | PageName
    | PropsName
    | "Root"
    | "Html"
    | "build"
    | "moduleBase"
    | "projectRoot"
    | "normalizer"
    | "moduleBasePath"
    | "pageExportName"
    | "propsExportName"
    | "rootExportName"
    | "htmlExportName"
    | "verbose"
  >;
  logger: Logger;
  manifest?: Manifest;
}): Promise<ResolvedBuildPages> {
  if (userOptions.verbose) {
    logger.info(
      `[resolveBuildPages] resolveBuildPages called with pages:${
        pages.length
      } and Root: ${typeof userOptions.Root} Html: ${typeof userOptions.Html}`
    );
  }
  // Check if pages array has changed
  const pagesChanged =
    !stashedPages ||
    stashedPages.length !== pages.length ||
    !stashedPages.every((page, i) => page === pages[i]);

  if (stashedBuildPages && !pagesChanged) {
    return stashedBuildPages; // Return directly without Promise.resolve
  } else if (userOptions.verbose) {
    if (stashedPages == null) {
      logger.info(
        `[resolveBuildPages] resolveBuildPages - first time resolving pages`
      );
    } else {
      logger.info(
        `[resolveBuildPages] resolveBuildPages - pages changed, re-resolving`
      );
    }
  }
  const errors: unknown[] = [];
  const pageMap = new Map<string, string>();
  const propsMap = new Map<string, string>();
  const rootMap = new Map<string, string>();
  const htmlMap = new Map<string, string>();
  const urlMap = new Map<
    string,
    { props: string | undefined; page: string; root?: string; html?: string }
  >();
  const routeMap = new Map<string, string[]>();

  for (const page of pages) {
    const pageResult = await resolveUrlOption(userOptions, "Page", page);
    if (pageResult.type === "error") {
      errors.push(pageResult.error);
      continue;
    }
    const [pageKey, pageValue] = userOptions.normalizer(pageResult.Page);
    const manifestResolvedPageValue = resolvePathWithManifest(pageValue, manifest);

    // Resolve Root component path if defined
    let rootValue: string | undefined;
    if (userOptions.Root) {
      if (userOptions.verbose) {
        logger.info(
          `[resolveBuildPages] resolveBuildPages - resolving Root for page: ${page}, Root option: ${userOptions.Root}`
        );
      }
      const rootResult = await resolveUrlOption(userOptions, "Root", page);
      if (rootResult.type === "error") {
        if (userOptions.verbose) {
          logger.info(
            `[resolveBuildPages] resolveBuildPages - Root resolution failed with error message: \"${
              (rootResult.error as Error)?.message
            }\"`
          );
        }
        errors.push(rootResult.error);
      } else {
        const [rootKey, resolvedRootValue] = userOptions.normalizer(
          rootResult.Root
        );
        const manifestResolvedRootValue = resolvePathWithManifest(resolvedRootValue, manifest);
        if (userOptions.verbose) {
          logger.info(
            `[resolveBuildPages] resolveBuildPages - Root resolved: ${rootResult.Root} -> ${resolvedRootValue} -> ${manifestResolvedRootValue}`
          );
        }
        rootValue = manifestResolvedRootValue;
        rootMap.set(rootKey, manifestResolvedRootValue);
      }
    }

    // Resolve Html component path if defined
    let htmlValue: string | undefined;
    if (userOptions.Html) {
      if (userOptions.verbose) {
        logger.info(
          `[resolveBuildPages] resolveBuildPages - resolving Html for page: ${page}, Html option: ${userOptions.Html}`
        );
      }
      const htmlResult = await resolveUrlOption(userOptions, "Html", page);
      if (htmlResult.type === "error") {
        if (userOptions.verbose) {
          logger.info(
            `[resolveBuildPages] resolveBuildPages - Html resolution failed with error message: \"${
              (htmlResult.error as Error)?.message
            }\"`
          );
        }
        errors.push(htmlResult.error);
      } else {
        const [htmlKey, resolvedHtmlValue] = userOptions.normalizer(
          htmlResult.Html
        );
        const manifestResolvedHtmlValue = resolvePathWithManifest(resolvedHtmlValue, manifest);
        if (userOptions.verbose) {
          logger.info(
            `[resolveBuildPages] resolveBuildPages - Html resolved: ${htmlResult.Html} -> ${resolvedHtmlValue} -> ${manifestResolvedHtmlValue}`
          );
        }
        htmlValue = manifestResolvedHtmlValue;
        htmlMap.set(htmlKey, manifestResolvedHtmlValue);
      }
    }

    if (!userOptions.props) {
      urlMap.set(page, {
        props: undefined,
        page: manifestResolvedPageValue,
        root: rootValue,
        html: htmlValue,
      });
      pageMap.set(pageKey, manifestResolvedPageValue);
      // Add to routeMap
      const routes = routeMap.get(manifestResolvedPageValue) || [];
      routes.push(page);
      routeMap.set(manifestResolvedPageValue, routes);
      continue;
    }
    try {
      await access(join(userOptions.projectRoot, manifestResolvedPageValue));
    } catch {
      errors.push(new Error(`Page file not found: ${manifestResolvedPageValue}`));
    }
    const propsResult = await resolveUrlOption(userOptions, "props", page);
    if (propsResult.type === "error") {
      errors.push(propsResult.error);
      continue;
    }

    // If propsPath is defined, check if it exists
    if (propsResult.props) {
      const [propsKey, propsValue] = userOptions.normalizer(propsResult.props);
      const manifestResolvedPropsValue = resolvePathWithManifest(propsValue, manifest);
      if (manifestResolvedPropsValue !== manifestResolvedPageValue) {
        try {
          await access(join(userOptions.projectRoot, manifestResolvedPropsValue));
        } catch {
          errors.push(new Error(`Props file not found: ${manifestResolvedPropsValue}`));
        }
      }
      urlMap.set(page, {
        props: manifestResolvedPropsValue,
        page: manifestResolvedPageValue,
        root: rootValue,
        html: htmlValue,
      });
      propsMap.set(propsKey, manifestResolvedPropsValue);

      // Add to routeMap for both page and props files
      const pageRoutes = routeMap.get(manifestResolvedPageValue) || [];
      pageRoutes.push(page);
      routeMap.set(manifestResolvedPageValue, pageRoutes);

      const propsRoutes = routeMap.get(manifestResolvedPropsValue) || [];
      propsRoutes.push(page);
      routeMap.set(manifestResolvedPropsValue, propsRoutes);
    } else {
      // If no props path, use the page path for both
      urlMap.set(page, {
        props: undefined,
        page: manifestResolvedPageValue,
        root: rootValue,
        html: htmlValue,
      });

      // Add to routeMap for page file only
      const routes = routeMap.get(manifestResolvedPageValue) || [];
      routes.push(page);
      routeMap.set(manifestResolvedPageValue, routes);
    }

    pageMap.set(pageKey, manifestResolvedPageValue);
  }

  // If there are no pages but custom components are defined, resolve them for a default route
  if (pages.length === 0 && (userOptions.Root || userOptions.Html)) {
    if (userOptions.verbose) {
      logger.info(
        `[resolveBuildPages] resolveBuildPages - No pages but custom components defined, resolving for default route`
      );
    }
    const defaultPage = "/";

    // Resolve Root component for default route
    if (userOptions.Root) {
      const rootResult = await resolveUrlOption(
        userOptions,
        "Root",
        defaultPage
      );
      if (rootResult.type === "success") {
        const [rootKey, resolvedRootValue] = userOptions.normalizer(
          rootResult.Root
        );
        if (userOptions.verbose) {
          logger.info(
            `[resolveBuildPages] resolveBuildPages - Default Root resolved: ${rootResult.Root} -> ${resolvedRootValue}`
          );
        }
        rootMap.set(rootKey, resolvedRootValue);
      }
    }

    // Resolve Html component for default route
    if (userOptions.Html) {
      const htmlResult = await resolveUrlOption(
        userOptions,
        "Html",
        defaultPage
      );
      if (htmlResult.type === "success") {
        const [htmlKey, resolvedHtmlValue] = userOptions.normalizer(
          htmlResult.Html
        );
        if (userOptions.verbose) {
          logger.info(
            `[resolveBuildPages] resolveBuildPages - Default Html resolved: ${htmlResult.Html} -> ${resolvedHtmlValue}`
          );
        }
        htmlMap.set(htmlKey, resolvedHtmlValue);
      }
    }
  }

  stashedBuildPages = {
    pageMap,
    propsMap,
    rootMap,
    htmlMap,
    urlMap,
    routeMap,
    errors,
  };
  stashedPages = [...pages];
  return stashedBuildPages;
}
