import { toError } from "../error/toError.js";
import type { GenericModuleLoader, PagePropOpt, PropsName } from "../types.js";

type ResolvePropsOptions = {
  id: string;
  url: string;
  exportName: string;
  loader: GenericModuleLoader;
};

type ValidPropTypes<T> =
  | T
  | Promise<T>
  | Array<T[keyof T]>
  | Array<[string, T[keyof T]]>
  | ((url: string) => ValidPropTypes<T>);

// prototype classes

type ResolvePropsResult<T extends PagePropOpt, N extends string> =
  | {
      type: "success";
      key: string;
      module?: {
        [key in N]:
          | ValidPropTypes<T>
          | ((url: string) => ValidPropTypes<T>)
          | (new (url: string) => T);
      };
    }
  | { type: "error"; key: string; error: Error; module?: never }
  | { type: "skip"; key: string; module?: never; error?: never };

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
  N extends string = PropsName
>({
  id,
  url,
  exportName,
  loader,
}: ResolvePropsOptions): Promise<ResolvePropsResult<T, N>> => {
  // Check if this is a stashed page that needs special handling
  const propsLoadResult = await (async (): Promise<
    | {
        type: "success";
        key: string;
        module: { [key in N]: ValidPropTypes<T> };
      }
    | { type: "error"; error: Error; module?: never }
  > => {
    try {
      const result = await loader(`${id}#${exportName}`);
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
    return {
      key: id,
      ...propsLoadResult,
    };
  }
  const { module } = propsLoadResult;
  const props = module[exportName as N];
  console.log("props",exportName, props, module);
  // handle different props use-cases
  if (module instanceof Error) {
    return {
      key: id,
      type: "error",
      error: module,
    };
  } else if (!(exportName in module)) {
    return {
      key: id,
      type: "success",
      module: { [exportName]: { url, ...module } } as never,
    };
  } else if (!props) {
    return {
      key: id,
      type: "success",
      module: { [exportName]: { url } } as never,
    };
  } else if (props instanceof Error) {
    return {
      key: id,
      type: "error",
      error: props,
    };
  } else if (typeof props === "function") {
    // Handle both class constructors and regular functions
    try {
      console.log("Calling props function with URL:", url);
      let propsResult;
      if (props.prototype && props.prototype.constructor) {
        // Class constructor case
        propsResult = new (props as unknown as new (url: string) => T)(url);
      } else {
        // Regular function case
        propsResult = props(url);
      }
      console.log("Props function result:", propsResult);

      // Handle recursive props validation
      if (propsResult instanceof Promise) {
        propsResult = await propsResult;
      }
      if (typeof propsResult === "function") {
        // Recursively handle nested functions
        return resolveProps<T, N>({
          id,
          url,
          exportName,
          loader: async () =>
            ({ [exportName]: propsResult } as {
              [key in N]: ValidPropTypes<T>;
            }),
        });
      } else if (Array.isArray(propsResult)) {
        // Handle array case
        return {
          type: "success",
          key: id,
          module: {
            [exportName]: Object.fromEntries(
              (propsResult as Array<[string, T[keyof T]]>).map((prop) =>
                typeof prop === "string" ? [prop, prop] : prop
              )
            ) as T,
          } as never,
        };
      }

      return {
        type: "success",
        key: id,
        module: { [exportName]: propsResult } as never,
      };
    } catch (error) {
      return {
        type: "error",
        key: id,
        error: toError(error),
      };
    }
  } else if (props instanceof Promise) {
    // object case
    try {
      return {
        type: "success",
        key: id,
        module: { [exportName]: await props } as never,
      };
    } catch (error) {
      return {
        type: "error",
        key: id,
        error: toError(error),
      };
    }
  } else if (Array.isArray(props)) {
    // array case
    try {
      return {
        type: "success",
        key: id,
        module: {
          [exportName]: Object.fromEntries(
            (props as Array<[string, T[keyof T]]>).map((prop) =>
              typeof prop === "string" ? [prop, prop] : prop
            )
          ) as T,
        } as never,
      };
    } catch (error) {
      return {
        type: "error",
        key: id,
        error: toError(error),
      };
    }
  } else if (typeof props === "string") {
    try {
      return {
        type: "success",
        key: id,
        module: { [exportName]: JSON.parse(props) } as never,
      };
    } catch (error) {
      return {
        type: "error",
        key: id,
        error: toError(error),
      };
    }
  }
  return {
    type: "success",
    key: id,
    module: { [exportName]: props } as never,
  };
};
