import type { 
  GenericModuleLoader, 
  HtmlComponentType, 
  RootFn, 
  ResolvedUserOptions 
} from "../types.js";
import { resolveComponentOptions } from "./resolveComponent.js";

/**
 * Resolves Root and Html components from user options using an available loader.
 * This function should be called when a loader is available but before creating handlers.
 * 
 * @param userOptions - The resolved user options (may contain string paths for Root/Html)
 * @param loader - The module loader to use for resolving string paths
 * @returns Promise containing resolved components and any errors
 */
export async function resolveHandlerComponents(
  userOptions: ResolvedUserOptions,
  loader: GenericModuleLoader
): Promise<{
  Root: RootFn;
  Html: HtmlComponentType;
  errors: Error[];
}> {
  // If Root and Html are already resolved components, return them as-is
  if (typeof userOptions.Root === "function" && typeof userOptions.Html === "function") {
    return {
      Root: userOptions.Root,
      Html: userOptions.Html,
      errors: [],
    };
  }

  // If either is a string, we need to resolve them
  const needsResolution = 
    typeof userOptions.Root === "string" || 
    typeof userOptions.Html === "string";

  if (!needsResolution) {
    return {
      Root: userOptions.Root as RootFn,
      Html: userOptions.Html as HtmlComponentType,
      errors: [],
    };
  }

  // Resolve string paths to components
  return await resolveComponentOptions({
    Root: userOptions.Root as RootFn | string,
    Html: userOptions.Html as HtmlComponentType | string,
    rootExportName: userOptions.rootExportName,
    htmlExportName: userOptions.htmlExportName,
    loader,
  });
} 