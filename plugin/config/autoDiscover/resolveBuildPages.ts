import { access } from "node:fs/promises";
import { join } from "node:path";
import type { PageName, PropsName, ResolvedBuildPages, ResolvedUserOptions } from "../../types.js";
import { resolveUrlOption } from "../resolveUrlOption.js";

let stashedBuildPages: ResolvedBuildPages | null = null;
let stashedPages: string[] | null = null;

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
}: {
  pages: string[];
  userOptions: Pick<ResolvedUserOptions, PageName | PropsName | "Root" | "Html" | "build" | "moduleBase" | "projectRoot" | "normalizer" | "moduleBasePath" | "pageExportName" | "propsExportName" | "rootExportName" | "htmlExportName">;
}): Promise<ResolvedBuildPages> {
  console.log(`[DEBUG] resolveBuildPages called with pages:`, pages, `Root:`, userOptions.Root, `Html:`, userOptions.Html);
  // Check if pages array has changed
  const pagesChanged =
    !stashedPages ||
    stashedPages.length !== pages.length ||
    !stashedPages.every((page, i) => page === pages[i]);

  if (stashedBuildPages && !pagesChanged) {
    return stashedBuildPages; // Return directly without Promise.resolve
  }
  const errors: Error[] = [];
  const pageMap = new Map<string, string>();
  const propsMap = new Map<string, string>();
  const rootMap = new Map<string, string>();
  const htmlMap = new Map<string, string>();
  const urlMap = new Map<string, { props: string | undefined; page: string; root?: string; html?: string }>();
  const routeMap = new Map<string, string[]>();

  for (const page of pages) {
    const pageResult = await resolveUrlOption(userOptions, "Page", page);
    if(pageResult.type === "error") {
      errors.push(pageResult.error);
      continue;
    }
    const [pageKey, pageValue] = userOptions.normalizer(pageResult.Page);
    
    // Resolve Root component path if defined
    let rootValue: string | undefined;
    if (userOptions.Root) {
      console.log(`[DEBUG] resolveBuildPages - resolving Root for page: ${page}, Root option: ${userOptions.Root}`);
      const rootResult = await resolveUrlOption(userOptions, "Root", page);
      if (rootResult.type === "error") {
        console.log(`[DEBUG] resolveBuildPages - Root resolution failed:`, rootResult.error);
        errors.push(rootResult.error);
      } else {
        const [rootKey, resolvedRootValue] = userOptions.normalizer(rootResult.Root);
        console.log(`[DEBUG] resolveBuildPages - Root resolved: ${rootResult.Root} -> ${resolvedRootValue}`);
        rootValue = resolvedRootValue;
        rootMap.set(rootKey, resolvedRootValue);
      }
    } else {
      console.log(`[DEBUG] resolveBuildPages - No Root option defined`);
    }
    
    // Resolve Html component path if defined
    let htmlValue: string | undefined;
    if (userOptions.Html) {
      console.log(`[DEBUG] resolveBuildPages - resolving Html for page: ${page}, Html option: ${userOptions.Html}`);
      const htmlResult = await resolveUrlOption(userOptions, "Html", page);
      if (htmlResult.type === "error") {
        console.log(`[DEBUG] resolveBuildPages - Html resolution failed:`, htmlResult.error);
        errors.push(htmlResult.error);
      } else {
        const [htmlKey, resolvedHtmlValue] = userOptions.normalizer(htmlResult.Html);
        console.log(`[DEBUG] resolveBuildPages - Html resolved: ${htmlResult.Html} -> ${resolvedHtmlValue}`);
        htmlValue = resolvedHtmlValue;
        htmlMap.set(htmlKey, resolvedHtmlValue);
      }
    } else {
      console.log(`[DEBUG] resolveBuildPages - No Html option defined`);
    }
    
    if(!userOptions.props) {
      urlMap.set(page, { props: undefined, page: pageValue, root: rootValue, html: htmlValue });
      pageMap.set(pageKey, pageValue);
      // Add to routeMap
      const routes = routeMap.get(pageValue) || [];
      routes.push(page);
      routeMap.set(pageValue, routes);
      continue;
    }
    try {
      await access(join(userOptions.projectRoot, pageValue));
    } catch {
      errors.push(new Error(`Page file not found: ${pageValue}`));
    }
    const propsResult = await resolveUrlOption(userOptions, "props", page);
    if(propsResult.type === "error") {
      errors.push(propsResult.error);
      continue;
    }

    // If propsPath is defined, check if it exists
    if (propsResult.props) {
      const [propsKey, propsValue] = userOptions.normalizer(propsResult.props);
      if (propsValue !== pageValue) {
        try {
          await access(join(userOptions.projectRoot, propsValue));
        } catch {
          errors.push(
            new Error(`Props file not found: ${propsValue}`)
          );
        }
      }
      urlMap.set(page, { props: propsValue, page: pageValue, root: rootValue, html: htmlValue });
      propsMap.set(propsKey, propsValue);
      
      // Add to routeMap for both page and props files
      const pageRoutes = routeMap.get(pageValue) || [];
      pageRoutes.push(page);
      routeMap.set(pageValue, pageRoutes);
      
      const propsRoutes = routeMap.get(propsValue) || [];
      propsRoutes.push(page);
      routeMap.set(propsValue, propsRoutes);
    } else {
      // If no props path, use the page path for both
      urlMap.set(page, { props: undefined, page: pageValue, root: rootValue, html: htmlValue });
      
      // Add to routeMap for page file only
      const routes = routeMap.get(pageValue) || [];
      routes.push(page);
      routeMap.set(pageValue, routes);
    }

    pageMap.set(pageKey, pageValue);
  }

  // If there are no pages but custom components are defined, resolve them for a default route
  if (pages.length === 0 && (userOptions.Root || userOptions.Html)) {
    console.log(`[DEBUG] resolveBuildPages - No pages but custom components defined, resolving for default route`);
    const defaultPage = "/";
    
    // Resolve Root component for default route
    if (userOptions.Root) {
      const rootResult = await resolveUrlOption(userOptions, "Root", defaultPage);
      if (rootResult.type === "success") {
        const [rootKey, resolvedRootValue] = userOptions.normalizer(rootResult.Root);
        console.log(`[DEBUG] resolveBuildPages - Default Root resolved: ${rootResult.Root} -> ${resolvedRootValue}`);
        rootMap.set(rootKey, resolvedRootValue);
      }
    }
    
    // Resolve Html component for default route
    if (userOptions.Html) {
      const htmlResult = await resolveUrlOption(userOptions, "Html", defaultPage);
      if (htmlResult.type === "success") {
        const [htmlKey, resolvedHtmlValue] = userOptions.normalizer(htmlResult.Html);
        console.log(`[DEBUG] resolveBuildPages - Default Html resolved: ${htmlResult.Html} -> ${resolvedHtmlValue}`);
        htmlMap.set(htmlKey, resolvedHtmlValue);
      }
    }
  }

  stashedBuildPages = { pageMap, propsMap, rootMap, htmlMap, urlMap, routeMap, errors };
  stashedPages = [...pages];
  return stashedBuildPages;
}
