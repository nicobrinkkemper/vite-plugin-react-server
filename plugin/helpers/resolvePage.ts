import { toError } from "../error/toError.js";
import type { PagePropOpt } from "../types.js";
import type React from "react";

type ResolvePageOptions<
  T extends PagePropOpt = PagePropOpt,
  ID extends string = string,
  N extends string = 'Page'
> = {
  id: ID;
  exportName: N;
  loader: <M extends N>(
    exportName: `${ID}#${M}`
  ) => Promise<{ [key in M]: React.ComponentType<T> }>;
};

type ResolvePageResult<T extends PagePropOpt, N extends string> =
  | {
      type: "success";
      Page: React.ComponentType<T>;
      module: { [key in N]: React.ComponentType<T> };
    }
  | { type: "error"; error: Error }
  | { type: "skip" };

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
export const resolvePage = async <
  T extends PagePropOpt = PagePropOpt,
  ID extends string = string,
  N extends string = string
>({
  id,
  exportName,
  loader,
}: ResolvePageOptions<T, ID, N>): Promise<ResolvePageResult<T, N>> => {
  // Check if this is a stashed page that needs special handling
  const pageLoadResult = await (async (): Promise<
    | {
        type: "success";
        key: string;
        module: { [key in N]: React.ComponentType<T> };
      }
    | { type: "error"; error: Error; module?: never }
  > => {
    try {
      return {
        type: "success",
        key: id,
        module: await loader(`${id}#${exportName}` as `${ID}#${N}`),
      };
    } catch (error) {
      return {
        type: "error",
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  })();

  if (pageLoadResult.type !== "success") {
    return pageLoadResult;
  }
  const { module } = pageLoadResult;
  const Page = module[exportName as N];
  if (module instanceof Error) {
    return {
      type: "error",
      error: {
        name: module.name,
        message: module.message,
        stack: module.stack,
      },
    };
  } else if (!(exportName in module)) {
    if ("error" in module) {
      return {
        type: "error",
        error: toError(module.error),
      };
    }
    console.log({ module });
    return {
      type: "error",
      error: new Error(`Export "${exportName}" not found in module ${id}.`),
    };
  } else if (!Page) {
    return {
      type: "error",
      error: new Error(
        `Export "${exportName}" is null or undefined in module ${id}.`
      ),
    };
  } else if (Page instanceof Error) {
    return {
      type: "error",
      error: Page,
    };
  }
  return {
    type: "success",
    Page,
    module: module as { [key in N]: React.ComponentType<T> },
  };
};
