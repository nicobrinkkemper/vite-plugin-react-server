import type { 
  GenericModuleLoader, 
  HtmlComponentType, 
  RootFn, 
  ResolvedUserOptions,
  StreamPluginOptions 
} from "../types.js";
import { resolveComponentOptions } from "./resolveComponent.js";

/**
 * Resolves Root and Html components from user options for a specific URL.
 * This function handles:
 * 1. Direct component overrides from options.components
 * 2. Router functions that return paths based on URL
 * 3. Static string paths
 * 4. String path resolution to actual components
 * 
 * @param userOptions - The resolved user options
 * @param url - The route URL to resolve components for
 * @param loader - The module loader for resolving string paths
 * @returns Promise containing resolved components and any errors
 */
export async function resolveUserComponents(
  userOptions: ResolvedUserOptions,
  _url: string,
  loader: GenericModuleLoader
): Promise<{
  Root: RootFn;
  Html: HtmlComponentType;
  errors: Error[];
}> {
  const errors: Error[] = [];

  // Start with defaults from resolved options (these might already be resolved by components override)
  let resolvedRoot = userOptions.Root;
  let resolvedHtml = userOptions.Html;

  // Check if we need to resolve string paths or router functions
  const needsRootResolution = typeof userOptions.Root === "string" || typeof userOptions.Root === "function";
  const needsHtmlResolution = typeof userOptions.Html === "string" || typeof userOptions.Html === "function";

  if (needsRootResolution || needsHtmlResolution) {
    // Get the original user options to check for router functions
    // Note: We need access to the original options, not just the resolved ones
    // For now, we'll work with what we have and assume they're already resolved in resolveOptions
    
    try {
      const componentResolution = await resolveComponentOptions({
        Root: resolvedRoot as RootFn | string,
        Html: resolvedHtml as HtmlComponentType | string,
        rootExportName: userOptions.rootExportName,
        htmlExportName: userOptions.htmlExportName,
        loader,
      });
      
      if (componentResolution.errors.length > 0) {
        errors.push(...componentResolution.errors);
      } else {
        resolvedRoot = componentResolution.Root;
        resolvedHtml = componentResolution.Html;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  return {
    Root: resolvedRoot as RootFn,
    Html: resolvedHtml as HtmlComponentType,
    errors,
  };
}

/**
 * Resolves router functions from original user options.
 * This function should be called BEFORE resolveUserComponents to handle
 * cases where Root/Html are router functions.
 * 
 * @param originalOptions - The original user options (may contain router functions)
 * @param url - The route URL
 * @returns Object with resolved string paths
 */
export function resolveRouterFunctions(
  originalOptions: Pick<StreamPluginOptions, "Root" | "Html" | "components">,
  url: string
): {
  Root: string | RootFn;
  Html: string | HtmlComponentType;
} {
  let resolvedRoot: string | RootFn = originalOptions.Root as any;
  let resolvedHtml: string | HtmlComponentType = originalOptions.Html as any;

  // Check for direct component overrides first
  if (originalOptions.components?.Root) {
    resolvedRoot = originalOptions.components.Root;
  } else if (typeof originalOptions.Root === "function") {
    // Detect if this is a router function (takes 1 string parameter) vs React component (takes props object)
    if (originalOptions.Root.length === 1) {
      // This is a router function, call it with the URL
      try {
        resolvedRoot = (originalOptions.Root as unknown as (url: string) => string)(url);
      } catch (error) {
        console.warn(`Failed to resolve Root for URL ${url}:`, error);
      }
    } else {
      // This is a React component, keep as-is
      resolvedRoot = originalOptions.Root;
    }
  }

  if (originalOptions.components?.Html) {
    resolvedHtml = originalOptions.components.Html;
  } else if (typeof originalOptions.Html === "function") {
    // Detect if this is a router function (takes 1 string parameter) vs React component (takes props object)
    if (originalOptions.Html.length === 1) {
      // This is a router function, call it with the URL
      try {
        resolvedHtml = (originalOptions.Html as unknown as (url: string) => string)(url);
      } catch (error) {
        console.warn(`Failed to resolve Html for URL ${url}:`, error);
      }
    } else {
      // This is a React component, keep as-is
      resolvedHtml = originalOptions.Html;
    }
  }

  return {
    Root: resolvedRoot,
    Html: resolvedHtml,
  };
} 