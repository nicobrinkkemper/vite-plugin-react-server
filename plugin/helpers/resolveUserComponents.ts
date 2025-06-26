import type { 
  GenericModuleLoader, 
  HtmlComponentType, 
  RootComponentType, 
  ResolvedUserOptions,
  StreamPluginOptions
} from "../types.js";
import { resolveComponent } from "./resolveComponent.js";
import { Root as DefaultRoot } from "../components/root.js";
import { Html as DefaultHtml } from "../components/html.js";

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
  url: string,
  loader: GenericModuleLoader
): Promise<{
  Root: RootComponentType;
  Html: HtmlComponentType;
  errors: Error[];
}> {
  const errors: Error[] = [];

  // Check for direct component overrides first
  if (userOptions.components?.Root) {
    return {
      Root: userOptions.components.Root,
      Html: userOptions.components.Html || DefaultHtml,
      errors: [],
    };
  }

  if (userOptions.components?.Html) {
    return {
      Root: DefaultRoot,
      Html: userOptions.components.Html,
      errors: [],
    };
  }

  // No component overrides, so we need to resolve paths to components
  let rootPath: string | undefined;
  let htmlPath: string | undefined;

  // Resolve Root path
  if (userOptions.Root) {
    if (typeof userOptions.Root === "function") {
      try {
        rootPath = await (userOptions.Root as (url: string) => string | Promise<string>)(url);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    } else if (typeof userOptions.Root === "string") {
      rootPath = userOptions.Root;
    }
  }

  // Resolve Html path
  if (userOptions.Html) {
    if (typeof userOptions.Html === "function") {
      try {
        htmlPath = await (userOptions.Html as (url: string) => string | Promise<string>)(url);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    } else if (typeof userOptions.Html === "string") {
      htmlPath = userOptions.Html;
    }
  }

  // Load components from paths
  let resolvedRoot: RootComponentType = DefaultRoot;
  let resolvedHtml: HtmlComponentType = DefaultHtml;

  // Only try to resolve if we have actual paths
  if (rootPath) {
    try {
      const rootResult = await resolveComponent<RootComponentType>({
        componentPath: rootPath,
        exportName: userOptions.rootExportName,
        loader,
      });
      
      if (rootResult.type === "success") {
        resolvedRoot = rootResult.component;
      } else if (rootResult.type === "error") {
        errors.push(rootResult.error);
        // Keep using default if resolution failed
      }
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
      // Keep using default if resolution failed
    }
  }

  if (htmlPath) {
    try {
      const htmlResult = await resolveComponent<HtmlComponentType>({
        componentPath: htmlPath,
        exportName: userOptions.htmlExportName,
        loader,
      });
      
      if (htmlResult.type === "success") {
        resolvedHtml = htmlResult.component;
      } else if (htmlResult.type === "error") {
        errors.push(htmlResult.error);
        // Keep using default if resolution failed
      }
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
      // Keep using default if resolution failed
    }
  }

  return {
    Root: resolvedRoot,
    Html: resolvedHtml,
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
  Root: string | undefined;
  Html: string | undefined;
} {
  let resolvedRoot: string | undefined;
  let resolvedHtml: string | undefined;

  // Check for direct component overrides first
  if (originalOptions.components?.Root) {
    // Component override, no path resolution needed
    return { Root: undefined, Html: undefined };
  }

  if (originalOptions.components?.Html) {
    // Component override, no path resolution needed
    return { Root: undefined, Html: undefined };
  }

  // Resolve router functions to string paths
  if (typeof originalOptions.Root === "function") {
    try {
      resolvedRoot = (originalOptions.Root as (url: string) => string)(url);
    } catch (error) {
      console.warn(`Failed to resolve Root for URL ${url}:`, error);
    }
  } else if (typeof originalOptions.Root === "string") {
    resolvedRoot = originalOptions.Root;
  }

  if (typeof originalOptions.Html === "function") {
    try {
      resolvedHtml = (originalOptions.Html as (url: string) => string)(url);
    } catch (error) {
      console.warn(`Failed to resolve Html for URL ${url}:`, error);
    }
  } else if (typeof originalOptions.Html === "string") {
    resolvedHtml = originalOptions.Html;
  }

  return {
    Root: resolvedRoot,
    Html: resolvedHtml,
  };
} 