import type { PageName, PropsName, RootName, HtmlName, ResolvedUserOptions } from "../types.js";

type SupportedOptionNames = PropsName | PageName | RootName | HtmlName;

type ResolvePageAndPropsOptionsSuccess<N extends SupportedOptionNames> = {
  [optionName in N]: string;
} & { type: "success"; error?: never };

type ResolvePageAndPropsOptionsError<N extends SupportedOptionNames> = {
  [optionName in N]?: never;
} & { type: "error"; error: unknown };

export type ResolvePageAndPropsReturn<N extends SupportedOptionNames> =
  | ResolvePageAndPropsOptionsSuccess<N>
  | ResolvePageAndPropsOptionsError<N>;

export type ResolvePageAndPropsOptionsFn = <N extends SupportedOptionNames>(
  options: Pick<
    ResolvedUserOptions,
    PropsName | PageName | RootName | HtmlName | "pageExportName" | "propsExportName" | "rootExportName" | "htmlExportName"
  >,
  optionName: N,
  url: string
) => Promise<ResolvePageAndPropsReturn<N>>;

/**
 * Resolves Page or props options to file paths.
 *
 * ## Usage Pattern:
 * 1. **BUILD TIME**: Called by `resolveBuildPages.ts` for each page in `build.pages`
 *    - Resolves all Page/props paths statically
 *    - Builds urlMap/pageMap/propsMap caches for fast runtime lookup
 *
 * 2. **RUNTIME**: Called by `getRouteFiles.ts` as dynamic fallback
 *    - Only when route not found in auto-discovered urlMap cache
 *    - Enables dynamic routing for routes not in build.pages
 *
 * ## Supported Option Types:
 * - **String**: Direct file path (e.g., "./src/HomePage.tsx")
 * - **Function**: Router function that takes URL and returns file path
 *   - Sync: `(url) => "./src/pages/" + url + ".tsx"`
 *   - Async: `(url) => Promise.resolve("./src/pages/" + url + ".tsx")`
 *
 * ## Discovery Limitation:
 * Function-based resolvers create a chicken-and-egg problem for auto-discovery:
 * - Build-time discovery needs to know all possible URLs to call resolvers
 * - URL discovery typically comes from scanning filesystem for Page files
 * - But function resolvers can't be statically analyzed without URLs
 *
 * This is why extending this pattern to Html/Root is complex when
 * build.pages is not specified - the system can't discover what files exist
 * without first knowing what URLs to resolve.
 */
export const resolveUrlOption: ResolvePageAndPropsOptionsFn = async function _resolveUrlOption(
  options,
  optionName,
  url
) {
  let configName = optionName as string;
  if(optionName === options.pageExportName) {
    configName = "Page" as never;
  } else if(optionName === options.propsExportName) {
    configName = "props" as never;
  } else if(optionName === options.rootExportName) {
    configName = "Root" as never;
  } else if(optionName === options.htmlExportName) {
    configName = "Html" as never;
  }
  if(!(configName === "Page" || configName === "props" || configName === "Root" || configName === "Html")) {
    throw new Error(`Invalid option name: ${optionName}`);
  }
  try {
    let optionValue: any;
    switch (configName) {
      case "Page":
        optionValue = options.Page;
        break;
      case "props":
        optionValue = options.props;
        break;
      case "Root":
        optionValue = options.Root;
        break;
      case "Html":
        optionValue = options.Html;
        break;
      default:
        return { type: "error", error: new Error(`Unknown config name: ${configName}`) };
    }

    switch (typeof optionValue) {
      case "function": {
        const fn = optionValue;
        const result = fn(url);
        if (typeof result === "string") {
          return { type: "success", [configName]: result } as any;
        }
        if (result === undefined && configName === "props") {
          // Props are optional by contract — fileRouter types `props` as
          // `(url) => string | undefined`, and a route directory may carry a
          // page.tsx with no sibling props file. Treating undefined as an
          // error here silently DROPPED the route from the build worklist;
          // it must resolve to "no props" and render with empty props.
          return { type: "success", props: undefined } as any;
        }
        if (result instanceof Promise) {
          try {
            const promiseResult = await result;
            if (typeof promiseResult === "string") {
              return { type: "success", [configName]: promiseResult } as any;
            }
            if (promiseResult === undefined && configName === "props") {
              return { type: "success", props: undefined } as any;
            }
          } catch (error) {
            return { type: "error", error: error as Error };
          }
        }
        break;
      }
      case "string":
        return { type: "success", [configName]: optionValue } as any;
      default:
        break;
    }
    return { type: "error", error: new Error(`${configName} must be string or function that returns a string`) };
  } catch (error) {
    return { type: "error", error: error as Error };
  }
}
