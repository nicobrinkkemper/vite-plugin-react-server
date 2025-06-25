import { toError } from "../error/toError.js";
import type { GenericModuleLoader, HtmlComponentType, RootFn } from "../types.js";

export type ComponentName = "Root" | "Html";

type ResolveComponentResult<T = unknown> =
  | {
      type: "success";
      component: T;
      error?: never;
    }
  | { type: "error"; error: Error; component?: never }
  | { type: "skip"; error?: never; component?: never };

type ResolveComponentOptions = {
  componentPath: string;
  exportName: string;
  loader: GenericModuleLoader;
};

/**
 * Resolves a component (Root or Html) from a string path.
 * 
 * This function handles:
 * - String paths: "src/Root.tsx"
 * - Fragment syntax: "src/components.tsx#MyRoot"
 * - Export name resolution
 * 
 * @param options.componentPath - The path to the component file
 * @param options.exportName - The name of the export to resolve (e.g. 'Root', 'Html')
 * @param options.loader - The loader function to use for loading the module
 * 
 * @returns A result object containing the resolved component or error
 */
export async function resolveComponent<T = RootFn | HtmlComponentType>(
  options: ResolveComponentOptions
): Promise<ResolveComponentResult<T>> {
  const { componentPath, exportName, loader } = options;
  
  try {
    // Handle fragment syntax (e.g., "src/components.tsx#MyRoot")
    let modulePath = componentPath;
    let moduleExportName = exportName;
    
    if (componentPath.includes('#')) {
      const [path, fragmentExport] = componentPath.split('#');
      modulePath = path;
      moduleExportName = fragmentExport;
    }

    // Load the module
    const module = await loader(`${modulePath}#${moduleExportName}`);
    
    if (module == null) {
      return {
        type: "error",
        error: new Error(`Module ${modulePath} not found`),
      };
    }

    if (module instanceof Error) {
      return {
        type: "error",
        error: module,
      };
    }

    // Get the component from the module
    const component = module[moduleExportName];
    
    if (!(moduleExportName in module)) {
      if ("error" in module) {
        return {
          type: "error",
          error: toError(module["error"]),
        };
      }
      return {
        type: "error",
        error: new Error(`Export "${moduleExportName}" not found in module ${modulePath}.`),
      };
    }

    if (!component) {
      return {
        type: "error",
        error: new Error(
          `Export "${moduleExportName}" is null or undefined in module ${modulePath}.`
        ),
      };
    }

    if (component instanceof Error) {
      return {
        type: "error",
        error: component,
      };
    }

    return {
      type: "success",
      component: component as T,
    };
  } catch (error) {
    return {
      type: "error",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Resolves Root and Html components from user options.
 * 
 * This function checks if Root/Html are strings and resolves them to components.
 * If they're already components, it returns them as-is.
 * 
 * @param options - Object containing Root, Html, and resolution options
 * @returns Resolved components or original values if not strings
 */
export async function resolveComponentOptions(options: {
  Root: RootFn | string;
  Html: HtmlComponentType | string; 
  rootExportName: string;
  htmlExportName: string;
  loader: GenericModuleLoader;
}): Promise<{
  Root: RootFn;
  Html: HtmlComponentType;
  errors: Error[];
}> {
  const errors: Error[] = [];
  let resolvedRoot = options.Root;
  let resolvedHtml = options.Html;

  // Resolve Root if it's a string
  if (typeof options.Root === "string") {
    const rootResult = await resolveComponent<RootFn>({
      componentPath: options.Root,
      exportName: options.rootExportName,
      loader: options.loader,
    });
    
    if (rootResult.type === "success") {
      resolvedRoot = rootResult.component;
    } else if (rootResult.type === "error") {
      errors.push(rootResult.error);
      // Keep original value as fallback
    }
  }

  // Resolve Html if it's a string
  if (typeof options.Html === "string") {
    const htmlResult = await resolveComponent<HtmlComponentType>({
      componentPath: options.Html,
      exportName: options.htmlExportName,
      loader: options.loader,
    });
    
    if (htmlResult.type === "success") {
      resolvedHtml = htmlResult.component;
    } else if (htmlResult.type === "error") {
      errors.push(htmlResult.error);
      // Keep original value as fallback
    }
  }

  return {
    Root: resolvedRoot as RootFn,
    Html: resolvedHtml as HtmlComponentType,
    errors,
  };
} 