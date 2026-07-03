import { DEFAULT_CONFIG } from "../config/defaults.js";
import { toError } from "../error/toError.js";
import type {
  CreateHandlerOptions,
  PageComponentType,
  PagePropOpt,
} from "../types.js";
import { resolvePage } from "./resolvePage.js";
import { resolveProps, type LoaderCtx } from "./resolveProps.js";
import { routeToURL } from "../utils/routeToURL.js";
import { matchRoutes } from "../router/matchRoute.js";

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
        handlerOptions.logger?.info(
          `[resolvePageAndProps] Starting resolution for route: ${handlerOptions.route}`
        );
      }

      const url =
        handlerOptions.url ??
        routeToURL(
          handlerOptions.route ?? "",
          handlerOptions.moduleBaseURL ?? "/",
          handlerOptions?.build?.rscOutputPath ??
            DEFAULT_CONFIG.BUILD.rscOutputPath
        );

      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(
          `[resolvePageAndProps] URL resolved: ${url}. Starting page resolution`
        );
      }

      // Loader context: `props(url, { params, request })`. Params are either
      // precomputed by the caller or derived here from the route patterns.
      // Match against the normalized pathname (same basis page-selection uses):
      // drop the query, the `.rsc`/`.html` transport suffix, and a trailing
      // slash, so `/profile/42.rsc` resolves `{ id: "42" }`, not `"42.rsc"`.
      const rscSuffix =
        handlerOptions.build?.rscOutputPath ??
        DEFAULT_CONFIG.BUILD.rscOutputPath;
      const normalizeForMatch = (u: string): string => {
        let p = u.split("?")[0];
        if (rscSuffix && p.endsWith(rscSuffix)) p = p.slice(0, -rscSuffix.length);
        else if (p.endsWith(".html")) p = p.slice(0, -".html".length);
        if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
        return p || "/";
      };
      const params =
        handlerOptions.params ??
        (handlerOptions.routePatterns?.length
          ? matchRoutes(
              handlerOptions.routePatterns,
              normalizeForMatch(handlerOptions.route || url)
            )?.params ?? {}
          : {});
      const loaderCtx: LoaderCtx = { params, request: handlerOptions.request };

      const resolvePagePromise = resolvePage({
        id: handlerOptions.pagePath,
        exportName:
          handlerOptions.pageExportName ?? DEFAULT_CONFIG.PAGE_EXPORT_NAME,
        loader: handlerOptions.loader,
      });

      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(
          `[resolvePageAndProps] Starting props resolution`
        );
      }

      const resolvePropsPromise = resolveProps({
        url,
        ctx: loaderCtx,
        id: handlerOptions.propsPath || handlerOptions.pagePath,
        exportName:
          handlerOptions.propsExportName ?? DEFAULT_CONFIG.PROPS_EXPORT_NAME,
        loader: async (idWithExport?: string) => {
          if (handlerOptions.verbose) {
            handlerOptions.logger?.info(
              `[resolvePageAndProps] Props loader called with: ${idWithExport}`
            );
          }
          
          // Parse the id to extract the path and export name if using # syntax
          let propsId = handlerOptions.propsPath || handlerOptions.pagePath;
          let propsExportName = handlerOptions.propsExportName ?? DEFAULT_CONFIG.PROPS_EXPORT_NAME;
          
          if (idWithExport && idWithExport.includes('#')) {
            const [id, exportName] = idWithExport.split('#');
            propsId = id;
            if (exportName) {
              propsExportName = exportName;
            }
          }
          
          const resolvePageResult = await resolvePagePromise;
          if (resolvePageResult.type === "error") {
            if (handlerOptions.verbose) {
              handlerOptions.logger?.error("resolveProps", {
                error: resolvePageResult.error,
              });
            }
            if (resolvePageResult.error != null) {
              throw resolvePageResult.error;
            }
            throw new Error("Failed to resolve page in props loader");
          }
          if (
            resolvePageResult.type === "success" &&
            propsExportName in resolvePageResult.module
          ) {
            if (handlerOptions.verbose) {
              handlerOptions.logger?.info(
                `[resolvePageAndProps] Props found in page module`
              );
            }
            // return the module
            return resolvePageResult.module;
          }
          if (propsId && propsId !== handlerOptions.pagePath) {
            // Separate props file
            if (handlerOptions.verbose) {
              handlerOptions.logger?.info(
                `[resolvePageAndProps] Loading props from separate file: ${propsId}`
              );
            }
            const result = await handlerOptions.loader(propsId);
            return result;
          } else if (propsId === handlerOptions.pagePath) {
            // Props might be in the page module
            if (handlerOptions.verbose) {
              handlerOptions.logger?.info(
                `[resolvePageAndProps] Checking page module for props: ${propsId}`
              );
            }
            if (resolvePageResult.type === "success") {
              const pageModule = resolvePageResult.module;
              if (propsExportName in pageModule) {
                if (handlerOptions.verbose) {
                  handlerOptions.logger?.info(
                    `[resolvePageAndProps] Props found in page module`
                  );
                }
                return pageModule;
              }
            }
            // Try loading the page module directly
            const result = await handlerOptions.loader(propsId);
            return result;
          }
          if (handlerOptions.verbose) {
            handlerOptions.logger?.info(
              `[resolvePageAndProps] Using default props with URL`
            );
          }
          return {
            [propsExportName]: { url: url },
          };
        },
      });

      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(
          `[resolvePageAndProps] Waiting for both promises to resolve`
        );
      }

      const [resolvePageResult, resolvePropsResult] = await Promise.all([
        resolvePagePromise,
        resolvePropsPromise,
      ]);

      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(
          `[resolvePageAndProps] Both promises resolved`
        );
      }

      if (resolvePageResult.type != "success") {
        if (handlerOptions.verbose) {
          handlerOptions.logger?.error(
            `[resolvePageAndProps] Page resolution failed: ${resolvePageResult.type}`
          );
        }
        return resolvePageResult;
      }
      if (resolvePropsResult.type != "success") {
        if (handlerOptions.verbose) {
          handlerOptions.logger?.error(
            `[resolvePageAndProps] Props resolution failed: ${resolvePropsResult.type}`
          );
        }
        return resolvePropsResult;
      }

      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(
          `[resolvePageAndProps] Both page and props resolved successfully`
        );
      }

      let pageProps = resolvePropsResult.module?.[
        handlerOptions.propsExportName as keyof typeof resolvePropsResult.module
      ] as any;

      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(
          `[resolvePageAndProps] Raw pageProps type: ${typeof pageProps}, isFunction: ${typeof pageProps === "function"}`
        );
      }

      // If props is a function, call it with the URL
      if (typeof pageProps === "function") {
        if (handlerOptions.verbose) {
          handlerOptions.logger?.info(
            `[resolvePageAndProps] Props is a function, calling with url: ${url}`
          );
        }
        try {
          pageProps = pageProps(url, loaderCtx);
          // Await if it returns a Promise
          if (pageProps instanceof Promise) {
            pageProps = await pageProps;
          }
        } catch (error) {
          if (handlerOptions.verbose) {
            handlerOptions.logger?.error(
              `[resolvePageAndProps] Error calling props function: ${error}`
            );
          }
          pageProps = {};
        }
      }

      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(
          `[resolvePageAndProps] Extracted pageProps: ${JSON.stringify(Object.keys(pageProps || {}).length, null, 2)} keys`
        );
        handlerOptions.logger?.info(
          `[resolvePageAndProps] resolvePropsResult.module keys: ${Object.keys(resolvePropsResult.module || {}).join(", ")}`
        );
      }

      return {
        type: "success" as const,
        PageComponent: resolvePageResult.module[
          handlerOptions.pageExportName
        ] as never,
        pageProps: pageProps ?? {}, // Ensure pageProps is always an object, not undefined
      };
    } catch (error) {
      if (handlerOptions.verbose) {
        handlerOptions.logger?.error(
          `[resolvePageAndProps] Error in resolvePageAndProps: ${error}`
        );
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
    | "routePatterns"
    | "params"
    | "request"
  > & {
    moduleBaseURL?: string;
    route?: string;
    url?: string;
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
    };
  }
) => Promise<ResolvePageAndPropsResult<T>>;
