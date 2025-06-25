import type { PageName, PropsName, ResolvedUserOptions } from "../types.js";

import { resolveUrlOption } from "../config/resolveUrlOption.js";
import type { AutoDiscoveredFiles } from "../types.js";

type GetRouteFilesSuccess = {
  type: "success";
  page: string;
  props?: string | undefined;
  root?: string | undefined;
  html?: string | undefined;
};

type GetRouteFilesError = {
  type: "error";
  error: Error;
};

/**
 * Gets page and props file paths for a route using cached discovery + dynamic fallback.
 * 
 * ## RUNTIME RESOLUTION STRATEGY
 * This function implements a two-tier lookup strategy:
 * 
 * 1. **FAST PATH**: Check auto-discovered urlMap cache first
 *    - Built by resolveBuildPages.ts from build.pages array
 *    - O(1) lookup, no I/O, very fast
 *    - Used for routes that were pre-discovered at build time
 * 
 * 2. **FALLBACK PATH**: Dynamic resolution via resolveUrlOption
 *    - Only when route not found in urlMap cache
 *    - Calls Page/props resolver functions with the route URL
 *    - Enables dynamic routing beyond what's in build.pages
 *    - Slower due to function calls + potential I/O
 * 
 * ## Auto-Discovery Integration:
 * Results from dynamic resolution are cached back into autoDiscoveredFiles.urlMap
 * for future requests, so each route is only resolved dynamically once.
 * 
 * ## Function Resolver Support:
 * This is where router functions like `(url) => "./src/pages/" + url + ".tsx"` 
 * are actually called. The dynamic nature allows runtime route resolution but
 * creates complexity for static analysis and build-time discovery.
 */
export const getRouteFiles = async (
  route: string,
  autoDiscoveredFiles: AutoDiscoveredFiles,
  userOptions: Pick<ResolvedUserOptions, PageName | PropsName | "Root" | "Html" | "moduleBasePath" | "verbose" | "pageExportName" | "propsExportName" | "rootExportName" | "htmlExportName">
): Promise<GetRouteFilesSuccess | GetRouteFilesError> => {
  if(userOptions.verbose) {
    console.log("[getRouteFiles] Looking up route:", route);
    console.log("[getRouteFiles] urlMap has route?", autoDiscoveredFiles.urlMap.has(route));
    console.log("[getRouteFiles] urlMap keys:", Array.from(autoDiscoveredFiles.urlMap.keys()));
  }
  
  if (autoDiscoveredFiles.urlMap.has(route)) {
    const cached = autoDiscoveredFiles.urlMap.get(route)!;
    const { page, props } = cached;
    let { root, html } = cached;
    
    if(userOptions.verbose) {
      console.log("[getRouteFiles] Found in urlMap:", { page, props, root, html });
    }
    
    // For cached routes, we still need to resolve Root and Html dynamically if they are functions
    // and not already cached
    if (!root && userOptions.Root) {
      const { type: rootType, error: rootError, Root } = await resolveUrlOption(userOptions, "Root", route);
      if (rootType === "error") {
        return { type: "error", error: rootError };
      }
      root = Root;
      // Update cache with resolved root path
      autoDiscoveredFiles.urlMap.set(route, { page, props, root, html });
    }
    
    if (!html && userOptions.Html) {
      const { type: htmlType, error: htmlError, Html } = await resolveUrlOption(userOptions, "Html", route);
      if (htmlType === "error") {
        return { type: "error", error: htmlError };
      }
      html = Html;
      // Update cache with resolved html path
      autoDiscoveredFiles.urlMap.set(route, { page, props, root, html });
    }
    
    return { type: "success", page, props, root, html };
  }
  if(userOptions.verbose) {
    console.log("[getRouteFiles] Not in urlMap, resolving Page option");
  }
  const { type, error, Page } = await resolveUrlOption(
    userOptions,
    "Page",
    route
  );
  if(type === "error") {
    if(userOptions.verbose) {
      console.log("[getRouteFiles] Page resolution error:", error);
    }
    return { type: "error", error };
  }
  if(userOptions.verbose) {
    console.log("[getRouteFiles] Page resolved to:", Page);
  }
  // Resolve Root and Html components
  let root: string | undefined;
  let html: string | undefined;
  
  if (userOptions.Root) {
    const { type: rootType, error: rootError, Root } = await resolveUrlOption(userOptions, "Root", route);
    if (rootType === "error") {
      return { type: "error", error: rootError };
    }
    root = Root;
  }
  
  if (userOptions.Html) {
    const { type: htmlType, error: htmlError, Html } = await resolveUrlOption(userOptions, "Html", route);
    if (htmlType === "error") {
      return { type: "error", error: htmlError };
    }
    html = Html;
  }

  if (!userOptions.props) {
    if(userOptions.verbose) {
      console.log("[getRouteFiles] No props option, returning page only");
    }
    autoDiscoveredFiles.urlMap.set(route, { page: Page, props: undefined, root, html });
    return { type: "success", page: Page, props: undefined, root, html };
  }
  if(userOptions.verbose) {
    console.log("[getRouteFiles] Resolving props option");
  }
  const {
    type: propsType,
    error: propsError,
    props,
  } = await resolveUrlOption(userOptions, "props", route);

  if (propsType === "error") {
    if(userOptions.verbose) {
      console.log("[getRouteFiles] Props resolution error:", propsError);
    }
    return { type: "error", error: propsError };
  }
  if(userOptions.verbose) {
    console.log("[getRouteFiles] Props resolved to:", props);
  }
  autoDiscoveredFiles.urlMap.set(route, { page: Page, props, root, html });
  return { type: "success", page: Page, props, root, html };
};
