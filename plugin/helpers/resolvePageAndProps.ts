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
      const url = routeToURL(
        handlerOptions.route,
        handlerOptions.moduleBaseURL,
        handlerOptions.build.rscOutputPath
      );

      // Load the page component
      const resolvePagePromise = resolvePage({
        id: handlerOptions.pagePath,
        exportName:
          handlerOptions.pageExportName ?? DEFAULT_CONFIG.PAGE_EXPORT_NAME,
        loader: handlerOptions.loader,
      });
      const resolvePropsPromise = resolveProps({
        url,
        id: handlerOptions.propsPath || handlerOptions.pagePath,
        exportName:
          handlerOptions.propsExportName ?? DEFAULT_CONFIG.PROPS_EXPORT_NAME,
        loader: async () => {
          const resolvePageResult = await resolvePagePromise;
          if (resolvePageResult.type === "error") {
            if (handlerOptions.verbose) {
              handlerOptions.logger?.error("resolveProps", {
                error: resolvePageResult.error,
              });
            }
            throw resolvePageResult.error;
          }
          if (
            resolvePageResult.type === "success" &&
            handlerOptions.propsExportName in resolvePageResult.module
          ) {
            // return the module
            return resolvePageResult.module;
          }
          if (handlerOptions.propsPath) {
            return handlerOptions.loader(handlerOptions.propsPath);
          }
          return {
            [handlerOptions.propsExportName]: { url: url },
          };
        },
      });
      const [resolvePageResult, resolvePropsResult] = await Promise.all([
        resolvePagePromise,
        resolvePropsPromise,
      ]);
      if (resolvePageResult.type != "success") {
        return resolvePageResult;
      }
      if (resolvePropsResult.type != "success") {
        return resolvePropsResult;
      }
      return {
        type: "success" as const,
        PageComponent: resolvePageResult.module[
          handlerOptions.pageExportName
        ] as never,
        pageProps: resolvePropsResult.module?.[
          handlerOptions.propsExportName as keyof typeof resolvePropsResult.module
        ] as never,
      };
    } catch (error) {
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
    | "route"
    | "loader"
    | "moduleBaseURL"
    | "build"
    | "verbose"
    | "logger"
  >
) => Promise<ResolvePageAndPropsResult<T>>;
