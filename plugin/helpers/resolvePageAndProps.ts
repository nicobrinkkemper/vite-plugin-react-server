import { toError } from "../error/toError.js";
import type {
  CreateHandlerOptions,
  PageComponentType,
  PagePropOpt,
  AsOpt,
  PageName,
  PropsName,
  ReactStreamHandlerFn,
  InlineCssOpt,
  GenericModuleLoader,
} from "../types.js";
import { resolvePage } from "./resolvePage.js";
import { resolveProps } from "./resolveProps.js";

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
  >
) => Promise<ResolvePageAndPropsResult<T>>;

export const resolvePageAndProps: ResolvePageAndPropsFn =
  async function _resolvePageAndProps(handlerOptions) {
    try {
      // Load the page component
      const resolvePagePromise = resolvePage({
        id: handlerOptions.pagePath,
        exportName: handlerOptions.pageExportName ?? "Page",
        loader: handlerOptions.loader as any,
      });
      console.log("resolvePagePromise", handlerOptions);
      const resolvePropsPromise = resolveProps({
        url: handlerOptions.route,
        id: handlerOptions.propsPath || handlerOptions.pagePath,
        exportName: handlerOptions.propsExportName ?? "props",
        loader: async () => {
          const resolvePageResult = await resolvePagePromise;
          if (resolvePageResult.type === "error") {
            throw resolvePageResult.error;
          }
          if (
            resolvePageResult.type === "success" &&
            handlerOptions.propsExportName in resolvePageResult.module
          ) {
            // return the module
            return resolvePageResult.module
          }
          if (handlerOptions.propsPath) {
            return handlerOptions.loader(handlerOptions.propsPath);
          }
          return {
            [handlerOptions.propsExportName]: { url: handlerOptions.route },
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
          handlerOptions.propsExportName
        ] as never,
      };
    } catch (error) {
      return {
        type: "error" as const,
        error: toError(error),
      };
    }
  };
