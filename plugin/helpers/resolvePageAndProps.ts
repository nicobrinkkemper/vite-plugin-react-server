import { toError } from "../error/toError.js";
import type {
  CreateHandlerOptions,
  PageComponentType,
  PagePropOpt,
} from "../types.js";
import { resolvePage } from "./resolvePage.js";
import { resolveProps } from "./resolveProps.js";

type ResolvePageAndPropsOptions<
  T extends PagePropOpt = PagePropOpt,
  ID1 extends string = string,
  ID2 extends string | undefined = ID1,
  N1 extends string = "Page",
  N2 extends string = "props"
> = Pick<
  CreateHandlerOptions<T, N1, N2, ID1, ID2, boolean>,
  | "pagePath"
  | "pageExportName"
  | "propsPath"
  | "propsExportName"
  | "route"
  | "loader"
>

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

export async function resolvePageAndProps<
  T extends PagePropOpt = PagePropOpt,
  ID1 extends string = string,
  ID2 extends string = ID1,
  N1 extends string = "Page",
  N2 extends string = "props"
>(
  handlerOptions: ResolvePageAndPropsOptions<T, ID1, ID2, N1, N2>
): Promise<ResolvePageAndPropsResult<T>> {
  try {
    // Load the page component
    const resolvePagePromise = resolvePage<T, ID1, N1>({
      id: handlerOptions.pagePath,
      exportName: handlerOptions.pageExportName ?? ("Page" as N1),
      loader: handlerOptions.loader as <M extends N1>(
        moduleID: `${ID1}#${M}`
      ) => Promise<{ [key in M]: React.ComponentType<T> }>,
    });
    const resolvePropsPromise = resolveProps<T, ID2, N2>({
      url: handlerOptions.route,
      id:
        handlerOptions.propsPath ?? (handlerOptions.pagePath as unknown as ID2),
      exportName: handlerOptions.propsExportName ?? ("props" as N2),
      loader: (handlerOptions.propsPath
        ? handlerOptions.loader
        : async () => {
            const resolvePageResult = await resolvePagePromise;
            if (resolvePageResult.type === "error") {
              throw resolvePageResult.error;
            }
            if (resolvePageResult.type === "skip") {
              throw new Error("Page load skipped");
            }
            return resolvePageResult.module;
          }) as <M extends string>(
        exportName: `${ID2}#${M}`
      ) => Promise<{ [key in M]: T }>,
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
    const { Page } = resolvePageResult;
    const { props } = resolvePropsResult;
    return {
      type: "success",
      PageComponent: Page,
      pageProps: props as T,
    };
  } catch (error) {
    return {
      type: "error",
      error: toError(error),
    };
  }
}
