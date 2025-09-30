import { DEFAULT_CONFIG } from "../config/defaults.js";
import { toError } from "../error/toError.js";
import type {
  CreateHandlerOptions,
  PageComponentType,
  PagePropOpt,
} from "../types.js";
import { resolvePage } from "./resolvePage.js";
import { resolveProps } from "./resolveProps.js";
import { routeToURL } from "../utils/routeToURL.js";

/**
 * Resolves the page and props for a given route, works in combination with resolveComponents
 * The special thing it does is that if the props is already in the page module, it will fallback to that.
 * @param handlerOptions - The handler options.
 * @returns The resolved page and props.
 */
export const resolvePageAndProps: ResolvePageAndPropsFn =
  async function _resolvePageAndProps(handlerOptions) {
    try {
      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(`[resolvePageAndProps] Starting resolution for route: ${handlerOptions.route}`);
    }

      const url = handlerOptions.url ?? routeToURL(
        handlerOptions.route ?? "",
        handlerOptions.moduleBaseURL ?? "/",
        handlerOptions?.build?.rscOutputPath ?? DEFAULT_CONFIG.BUILD.rscOutputPath
      );

      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(`[resolvePageAndProps] URL resolved: ${url}`);
      }

      // Load the page component
      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(`[resolvePageAndProps] Starting page resolution`);
      }

      const resolvePagePromise = resolvePage({
        id: handlerOptions.pagePath,
        exportName:
          handlerOptions.pageExportName ?? DEFAULT_CONFIG.PAGE_EXPORT_NAME,
        loader: handlerOptions.loader,
      });

      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(`[resolvePageAndProps] Starting props resolution`);
      }

      const resolvePropsPromise = resolveProps({
        url,
        id: handlerOptions.propsPath || handlerOptions.pagePath,
        exportName:
          handlerOptions.propsExportName ?? DEFAULT_CONFIG.PROPS_EXPORT_NAME,
        loader: async () => {
          if (handlerOptions.verbose) {
            handlerOptions.logger?.info(`[resolvePageAndProps] Props loader called`);
          }
          const resolvePageResult = await resolvePagePromise;
          if (resolvePageResult.type === "error") {
            if (handlerOptions.verbose) {
              handlerOptions.logger?.error("resolveProps", {
                error: resolvePageResult.error,
              });
            }
            if(resolvePageResult.error != null) {
              throw resolvePageResult.error;
            }
            throw new Error("Failed to resolve page in props loader");
          }
          if (
            resolvePageResult.type === "success" &&
            handlerOptions.propsExportName in resolvePageResult.module
          ) {
            if (handlerOptions.verbose) {
              handlerOptions.logger?.info(`[resolvePageAndProps] Props found in page module`);
            }
            // return the module
            return resolvePageResult.module;
          }
          if (handlerOptions.propsPath) {
            if (handlerOptions.verbose) {
              handlerOptions.logger?.info(`[resolvePageAndProps] Loading props from separate file: ${handlerOptions.propsPath}`);
            }
            const result = await handlerOptions.loader(handlerOptions.propsPath);
            return result;
          }
          if (handlerOptions.verbose) {
            handlerOptions.logger?.info(`[resolvePageAndProps] Using default props with URL`);
          }
          return {
            [handlerOptions.propsExportName]: { url: url },
          };
        },
      });

      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(`[resolvePageAndProps] Waiting for both promises to resolve`);
      }

      const [resolvePageResult, resolvePropsResult] = await Promise.all([
        resolvePagePromise,
        resolvePropsPromise,
      ]);

      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(`[resolvePageAndProps] Both promises resolved`);
      }

      if (resolvePageResult.type != "success") {
        if (handlerOptions.verbose) {
          handlerOptions.logger?.error(`[resolvePageAndProps] Page resolution failed: ${resolvePageResult.type}`);
        }
        return resolvePageResult;
      }
      if (resolvePropsResult.type != "success") {
        if (handlerOptions.verbose) {
          handlerOptions.logger?.error(`[resolvePageAndProps] Props resolution failed: ${resolvePropsResult.type}`);
        }
        return resolvePropsResult;
      }

      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(`[resolvePageAndProps] Both page and props resolved successfully`);
      }

      const pageProps = resolvePropsResult.module?.[
        handlerOptions.propsExportName as keyof typeof resolvePropsResult.module
      ] as never;
      
      return {
        type: "success" as const,
        PageComponent: resolvePageResult.module[
          handlerOptions.pageExportName
        ] as never,
        pageProps,
      };
    } catch (error) {
      if (handlerOptions.verbose) {
        handlerOptions.logger?.error(`[resolvePageAndProps] Error in resolvePageAndProps: ${error}`);
      }
      return {
        type: "error" as const,
        error: toError(error),
      };
    }
  };

type ResolvePageAndPropsResult<T extends PagePropOpt = PagePropOpt> =
  | {
      type: "success";
      error?: never;
      PageComponent: PageComponentType<T>;
      pageProps: T;
    }
  | {
      type: "error";
      error: Error;
      PageComponent?: never;
      pageProps?: never;
    }
  | {
      type: "skip";
      error?: never;
      PageComponent?: never;
      pageProps?: never;
    };

export type ResolvePageAndPropsFn = <T extends PagePropOpt = PagePropOpt>(
  options: Pick<
    CreateHandlerOptions,
    | "pagePath"
    | "pageExportName"
    | "propsPath"
    | "propsExportName"
    | "loader"
    | "verbose"
    | "logger"
  > & {
    moduleBaseURL?: string;
    route?: string;
    url?:string;
    build?: {
      rscOutputPath: string;
      outDir?: never;
      server?: never;
      client?: never;
      static?: never;
      pages?: never;
      pageExportName?: never;
      propsExportName?: never;
      rootExportName?: never;
    }
  }
) => Promise<ResolvePageAndPropsResult<T>>;
