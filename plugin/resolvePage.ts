import type { ComponentType } from "react";
import { stashReturnValue } from "./helpers/stashReturnValue.js";
import type { Loader } from "./types.js";

type ResolvePageOptions = {
  id: string; // This is already normalized from checkFilesExist
  exportName: string;
  loader: Loader;
};

type ResolvePageResult<T, N extends string> =
  | {
      type: "success";
      key: string;
      Page: ComponentType<T>;
      module: { [key in N]: ComponentType<T> };
    }
  | { type: "error"; error: Error }
  | { type: "skip" };

/**
 * Resolves a page component from a module.
 * The loader is responsible for providing the correct module structure,
 * this function just needs to find and return the requested export.
 *
 * @param options.pageModule - The module object from the loader
 * @param options.path - The normalized path to the module
 * @param options.url - The URL route this page handles
 * @param options.exportName - The name of the export to resolve (e.g. 'Page')
 * @param options.temporaryReferences - WeakMap used to store and retrieve virtual module references
 *
 * @returns A result object containing:
 *   - type: "success" | "error" | "skip"
 *   - key: The export name if successful
 *   - Page: The resolved page component if successful
 *   - error: Error message if failed
 */
export const resolvePage = stashReturnValue(async function _resolvePage<
  T,
  N extends string
>({
  id,
  exportName,
  loader,
}: ResolvePageOptions): Promise<ResolvePageResult<T, N>> {
  const pageLoadeResult = await (async (): Promise<
    | {
        type: "success";
        key: string;
        module: Record<string, any> & { [key in N]: ComponentType<T> };
      }
    | { type: "error"; error: Error; module?: never }
  > => {
    try {
      return {
        type: "success",
        key: id,
        module: await loader(id),
      };
    } catch (error) {
      console.trace(error)
      return {
        type: "error",
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  })();

  if (pageLoadeResult.type !== "success") {
    return pageLoadeResult;
  }
  const { module } = pageLoadeResult;

  if (module instanceof Error) {
    return {
      type: "error",
      error: module,
    };
  }
  if('error' in module) {
    return {
      type: "error",
      error: module['error'] instanceof Error ? module['error'] : new Error(String(module['error'])),
    };
  }

  // Try to get the export directly from the module
  if (exportName in module) {
    const Page = module[exportName];
    if (typeof Page !== "function") {
      return {
        type: "error",
        error: new Error(
          `Export ${exportName} in ${id} is not a function. ${JSON.stringify(
            module
          )}`
        ),
      };
    }
    return {
      type: "success",
      key: exportName,
      Page: Page,
      module: module,
    };
  } else {
    return {
      type: "error",
      error: new Error(
        `Export '${exportName}' or 'default' in ${id} is not a function. ${JSON.stringify(
          module
        )}`
      ),
    };
  }
});
