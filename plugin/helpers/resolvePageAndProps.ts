// Names come from the dependency-free leaf, NOT defaults.js: this module rides
// into baked edge bundles, and importing DEFAULT_CONFIG evaluates the whole
// config layer (rsl transformer, root probes) at module init there.
import {
  PAGE_EXPORT_NAME,
  PROPS_EXPORT_NAME,
  LAYOUT_EXPORT_NAME,
  RSC_OUTPUT_PATH,
} from "../config/routeExportNames.js";
import { toError } from "../error/toError.js";
import type {
  CreateHandlerOptions,
  PageComponentType,
  PagePropOpt,
} from "../types.js";
import { resolvePage } from "./resolvePage.js";
import { resolveProps, type LoaderCtx } from "./resolveProps.js";
import {
  resolveLayoutChain,
  type ResolvedLayoutLayer,
} from "./resolveLayoutChain.js";
import { routeToURL } from "../utils/routeToURL.js";
import { matchRoutes, normalizePathForMatch } from "../router/matchRoute.js";
import { isLoaderSignal } from "../router/loaderSignals.js";
import type { RouteLayer } from "../router/scanRoutes.js";

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
            RSC_OUTPUT_PATH
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
        RSC_OUTPUT_PATH;
      const params =
        handlerOptions.params ??
        (handlerOptions.routePatterns?.length
          ? matchRoutes(
              handlerOptions.routePatterns,
              normalizePathForMatch(
                handlerOptions.route || url,
                rscSuffix,
                handlerOptions.stripHtmlSuffix,
              )
            )?.params ?? {}
          : {});
      const loaderCtx: LoaderCtx = { params, request: handlerOptions.request };

      const resolvePagePromise = resolvePage({
        id: handlerOptions.pagePath,
        exportName:
          handlerOptions.pageExportName ?? PAGE_EXPORT_NAME,
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
          handlerOptions.propsExportName ?? PROPS_EXPORT_NAME,
        loader: async (idWithExport?: string) => {
          if (handlerOptions.verbose) {
            handlerOptions.logger?.info(
              `[resolvePageAndProps] Props loader called with: ${idWithExport}`
            );
          }
          
          // Parse the id to extract the path and export name if using # syntax
          let propsId = handlerOptions.propsPath || handlerOptions.pagePath;
          let propsExportName = handlerOptions.propsExportName ?? PROPS_EXPORT_NAME;
          
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
          // A redirect()/notFound() signal is control flow, not a failed
          // loader — let it reach the outer catch so the request pipeline
          // can translate it (3xx / 404) instead of rendering empty props.
          if (isLoaderSignal(error)) throw error;
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

      // Nested layouts: resolve the matched route's root→leaf `route.tsx` chain
      // (loaded components + per-layer loader props) so createElementWithReact can
      // fold them around the leaf page. Absent/empty when the route has no layouts.
      let layoutChain: ResolvedLayoutLayer[] | undefined;
      if (handlerOptions.layouts?.length) {
        layoutChain = await resolveLayoutChain({
          layouts: handlerOptions.layouts,
          url,
          ctx: loaderCtx,
          loader: handlerOptions.loader,
          layoutExportName:
            handlerOptions.layoutExportName ??
            LAYOUT_EXPORT_NAME,
          propsExportName:
            handlerOptions.propsExportName ??
            PROPS_EXPORT_NAME,
          verbose: handlerOptions.verbose,
          logger: handlerOptions.logger,
        });
      }

      return {
        type: "success" as const,
        PageComponent: resolvePageResult.module[
          handlerOptions.pageExportName
        ] as never,
        pageProps: pageProps ?? {}, // Ensure pageProps is always an object, not undefined
        layoutChain,
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
      /** Resolved root→leaf `route.tsx` layout chain (empty/undefined when none). */
      layoutChain?: ResolvedLayoutLayer[];
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
    | "stripHtmlSuffix"
    | "params"
    | "request"
  > & {
    moduleBaseURL?: string;
    route?: string;
    url?: string;
    /** Root→leaf `route.tsx` layers for the matched route (from scanRoutes). */
    layouts?: RouteLayer[];
    /** Export name a `route.tsx` uses for its layout (default "Layout"). */
    layoutExportName?: string;
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
