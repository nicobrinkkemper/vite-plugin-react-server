import { toError } from "../error/toError.js";
import type { PagePropOpt } from "../types.js";

type ResolvePropsOptions<
  ID extends string,
  N extends string,
  T extends PagePropOpt = PagePropOpt
> = {
  id: string;
  url: string;
  exportName: N;
  loader: <M extends N>(exportName: `${ID}#${M}`) => Promise<{ [key in M]: ValidPropTypes<T> }>;
};

type ValidPropTypes<T> =
  | T
  | Promise<T>
  | Array<T[keyof T]>
  | Array<[string, T[keyof T]]>
  | ((url: string) => ValidPropTypes<T>)

// prototype classes

type ResolvePropsResult<T extends PagePropOpt, N extends string> =
  | {
      type: "success";
      key: string;
      props: T;
      module?: {
        [key in N]:
          | ValidPropTypes<T>
          | ((url: string) => ValidPropTypes<T>)
          | (new (url: string) => T);
      };
    }
  | { type: "error"; error: Error }
  | { type: "skip" };

/**
 * Resolves props from a module, handling both real and virtual modules.
 *
 * During development (ssrLoadModule):
 * - Real modules have exports available directly on the module object
 * - Virtual modules have exports stored in temporaryReferences
 *
 * During build (createBuildLoader):
 * - Transformed modules (with ast/code) have exports as direct properties
 * - The exports array contains just the names of those exports
 * - We store the module in temporaryReferences for later use
 * - We access exports directly from the module object
 *
 * Props can be:
 * 1. A function that takes a URL and returns props
 * 2. A direct object of props
 * 3. A renamed export (where the actual export name differs from the expected name)
 *
 * @param options.propsModule - The module object from ssrLoadModule or createBuildLoader
 * @param options.path - The normalized path to the module
 * @param options.url - The URL route this page handles
 * @param options.exportName - The name of the export to resolve (e.g. 'props')
 * @param options.temporaryReferences - WeakMap used to store and retrieve virtual module references
 *
 * @returns A result object containing:
 *   - type: "success" | "error" | "skip"
 *   - key: The export name if successful
 *   - props: The resolved props if successful
 *   - error: Error message if failed
 */
export const resolveProps = async <
  T extends PagePropOpt = PagePropOpt,
  ID extends string = string,
  N extends string = "props"
>({
  id,
  url,
  exportName,
  loader,
}: ResolvePropsOptions<ID, N, T>): Promise<ResolvePropsResult<T, N>> => {
  // Check if this is a stashed page that needs special handling
  const propsLoadResult = await (async (): Promise<
    | { type: "success"; key: string; module: { [key in N]: ValidPropTypes<T> } }
    | { type: "error"; error: Error; module?: never }
  > => {
    try {
      const result = await loader<N>(`${id}#${exportName}` as `${ID}#${N}`);
      return {
        type: "success",
        key: id,
        module: result as { [key in N]: T },
      };
    } catch (error) {
      return {
        type: "error",
        error: toError(error),
      };
    }
  })();

  if (propsLoadResult.type !== "success") {
    return propsLoadResult;
  }
  const { module } = propsLoadResult;
  const props = module[exportName as N];
  // handle different props use-cases
  if (module instanceof Error) {
    return {
      type: "error",
      error: module,
    };
  } else if (!(exportName in module)) {
    return {
      type: "success",
      key: exportName,
      props: { url, ...module } as unknown as T,
      module,
    };
  } else if (!props) {
    return {
      type: "success",
      key: exportName,
      props: { url } as unknown as T,
      module: module as { [key in N]: T },
    };
  } else if (props instanceof Error) {
    return {
      type: "error",
      error: props,
    };
  } else if (typeof props === "function") {
    // Handle both class constructors and regular functions
    try {
      let propsResult;
      if (props.prototype && props.prototype.constructor) {
        // Class constructor case
        propsResult = new ((props as unknown) as new (url: string) => T)(url);
      } else {
        // Regular function case
        propsResult = (props as (url: string) => ValidPropTypes<T>)(url);
      }

      // Handle recursive props validation
      if (propsResult instanceof Promise) {
        propsResult = await propsResult;
      }
      if (typeof propsResult === "function") {
        // Recursively handle nested functions
        return resolveProps<T, ID, N>({
          id,
          url,
          exportName,
          loader: async () => ({ [exportName]: propsResult } as { [key in N]: ValidPropTypes<T> }),
        });
      } else if (Array.isArray(propsResult)) {
        // Handle array case
        return {
          type: "success",
          key: exportName,
          props: Object.fromEntries(
            (propsResult as Array<[string, T[keyof T]]>).map((prop) => 
              (typeof prop === "string" ? [prop, prop] : prop)
            )
          ) as T,
          module: module as { [key in N]: T },
        };
      }

      return {
        type: "success",
        key: exportName,
        props: propsResult,
        module: module as { [key in N]: T },
      };
    } catch (error) {
      return {
        type: "error",
        error: toError(error),
      };
    }
  } else if (props instanceof Promise) {
    // object case
    try {
      return {
        type: "success",
        key: exportName,
        props: await props,
        module: propsLoadResult.module,
      };
    } catch (error) {
      return {
        type: "error",
        error: toError(error),
      };
    }
  } else if (Array.isArray(props)) {
    // array case
    try {
      return {
        type: "success",
        key: exportName,
        props: Object.fromEntries(
          (props as Array<[string, T[keyof T]]>).map((prop) => 
            (typeof prop === "string" ? [prop, prop] : prop)
          )
        ) as T,
        module: propsLoadResult.module,
      };
    } catch (error) {
      return {
        type: "error",
        error: toError(error),
      };
    }
  } else if (typeof props === "string") {
    try {
      return {
        type: "success",
        key: exportName,
        props: JSON.parse(props),
      };
    } catch (error) {
      return {
        type: "error",
        error: toError(error),
      };
    }
  }
  return {
    type: "success",
    key: exportName,
    props: props as T,
    module: module as { [key in N]: T },
  };
};
