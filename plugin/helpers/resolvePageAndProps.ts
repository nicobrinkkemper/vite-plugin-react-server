import { resolvePage } from "../resolvePage.js";
import { resolveProps } from "../resolveProps.js";

type ResolvePageAndPropsOptions<N1 extends string, N2 extends string> = {
  pagePath: string;
  pageExportName: N1;
  propsPath?: string;
  propsExportName?: N2;
  route: string;
  loader: (id: string) => Promise<any>;
};

type ResolvePageAndPropsResult<T> =
  | {
      type: "success";
      error?: never;
      PageComponent: React.ComponentType<T>;
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
  T,
  N1 extends string,
  N2 extends string
>(
  handlerOptions: ResolvePageAndPropsOptions<N1, N2>
): Promise<ResolvePageAndPropsResult<T>> {
  try {
    // Load the page component
    const resolvePagePromise = resolvePage({
      id: handlerOptions.pagePath,
      exportName: handlerOptions.pageExportName,
      loader: handlerOptions.loader,
    });
    const resolvePropsPromise = resolveProps({
      url: handlerOptions.route,
      id: handlerOptions.propsPath ?? handlerOptions.pagePath,
      exportName: handlerOptions.propsExportName ?? "default",
      loader: handlerOptions.propsPath 
        ? handlerOptions.loader
        : async () => {
            const resolvePageResult = await resolvePagePromise;
            if (resolvePageResult.type != "success") {
              return resolvePageResult;
            }
            return resolvePageResult.module;
          },
    });
    const [resolvePageResult, resolvePropsResult] = await Promise.all([resolvePagePromise, resolvePropsPromise]);
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
      PageComponent: Page as React.ComponentType<T>,
      pageProps: props as T,
    };
  } catch (error) {
    return {
      type: "error",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
