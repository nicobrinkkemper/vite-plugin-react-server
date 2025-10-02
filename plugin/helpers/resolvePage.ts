import { toError } from "../error/toError.js";
import type { GenericModuleLoader } from "../types.js";

type ResolvePageResult =
  | {
      type: "success";
      module:  Record<string, unknown>;
      error?: never;
    }
  | { type: "error"; error: Error; Page?: never; module?: never }
  | { type: "skip"; error?: never; Page?: never; module?: never };

type ResolvePageFn = (options: {
  id: string;
  exportName: string;
  loader: GenericModuleLoader
}) => Promise<ResolvePageResult>;

/**
 * Resolves a page component from a module.
 *
 * During development (ssrLoadModule):
 * - Real modules have exports available directly on the module object
 * - Virtual modules have exports stored in temporaryReferences
 *
 * @param options.id - The module ID to resolve
 * @param options.exportName - The name of the export to resolve (e.g. 'Page')
 * @param options.loader - The loader function to use for loading the module
 *
 * @returns A result object containing:
 *   - type: "success" | "error" | "skip"
 *   - Page: The resolved page component if successful
 *   - error: Error message if failed
 */
export const resolvePage: ResolvePageFn = async function _resolvePage({
  id,
  exportName,
  loader,
}) {
  console.log(`[resolvePage] Resolving page: ${id}#${exportName}`);
  // Check if this is a stashed page that needs special handling
  const pageLoadResult = await (async () => {
    try {
      return {
        type: "success" as const,
        key: id,
        module: await loader(`${id}#${exportName}`),
      };
    } catch (error) {
      return {
        type: "error" as const,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  })();

  if (pageLoadResult.type !== "success") {
    return pageLoadResult;
  }
  const { module } = pageLoadResult;
  if (module == null) {
    return {
      type: "error" as const,
      error: new Error(`Module ${id} not found`),
    };
  }
  const Page = module[exportName];
  if (module instanceof Error) {
    return {
      type: "error" as const,
      error: {
        name: module.name,
        message: module.message,
        stack: module.stack,
      },
    };
  } else if (!(exportName in module)) {
    if ("error" in module) {
      return {
        type: "error" as const,
        error: toError(module["error"]),
      };
    }
    return {
      type: "error" as const,
      error: new Error(`Export "${exportName}" not found in module ${id}.`),
    };
  } else if (!Page) {
    return {
      type: "error" as const,
      error: new Error(
        `Export "${exportName}" is null or undefined in module ${id}.`
      ),
    };
  } else if (Page instanceof Error) {
    return {
      type: "error" as const,
      error: Page,
    };
  }
  return {
    type: "success" as const,
    module: module,
  };
};
