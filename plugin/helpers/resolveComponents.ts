import { resolvePageAndProps } from "./resolvePageAndProps.js";
import { resolveComponent } from "./resolveComponent.js";
import { Root as DefaultRoot } from "../components/root.js";
import { Html as DefaultHtml } from "../components/html.js";
import type { BuildModuleLoader, ResolvedUserOptions, PageComponentType, PagePropOpt, RootFn, HtmlComponentType, GenericModuleLoader } from "../types.js";

export type ResolveComponentsOptions = {
  pagePath: string;
  propsPath?: string;
  rootPath?: string;
  htmlPath?: string;
  pageExportName: string;
  propsExportName: string;
  rootExportName?: string;
  htmlExportName?: string;
  route: string;
  loader: BuildModuleLoader<ResolvedUserOptions> | GenericModuleLoader;
  // Allow override with direct components (for static builds)
  RootComponent?: RootFn;
  HtmlComponent?: HtmlComponentType;
};

export type ResolveComponentsSuccess = {
  type: "success";
  PageComponent: PageComponentType<PagePropOpt>;
  pageProps: PagePropOpt;
  RootComponent: RootFn;
  HtmlComponent: HtmlComponentType;
};

export type ResolveComponentsError = {
  type: "error";
  error: Error;
  reason?: string;
};

export type ResolveComponentsResult = ResolveComponentsSuccess | ResolveComponentsError;

/**
 * Unified component resolution function that builds a complete components object.
 * Uses resolvePageAndProps internally and resolves Root/Html components alongside.
 */
export const resolveComponents = async ({
  pagePath,
  propsPath,
  rootPath,
  htmlPath,
  pageExportName,
  propsExportName,
  rootExportName = "Root",
  htmlExportName = "Html",
  route,
  loader,
  RootComponent: overrideRootComponent,
  HtmlComponent: overrideHtmlComponent,
}: ResolveComponentsOptions): Promise<ResolveComponentsResult> => {
  try {
    // First resolve page and props using existing function
    const pageAndPropsResult = await resolvePageAndProps({
      pagePath,
      propsPath,
      pageExportName,
      propsExportName,
      route,
      loader,
    });

    if (pageAndPropsResult.type !== "success") {
      if (pageAndPropsResult.type === "error") {
        return {
          type: "error",
          error: pageAndPropsResult.error,
          reason: "Page/props resolution failed",
        };
      }
      return {
        type: "error",
        error: new Error("Page/props resolution was skipped"),
        reason: "Page/props resolution was skipped",
      };
    }

    const { PageComponent, pageProps } = pageAndPropsResult;

    // Resolve Root component (use override if provided, otherwise resolve from path)
    let RootComponent = overrideRootComponent || DefaultRoot;
    if (!overrideRootComponent && rootPath) {
      console.log(`[DEBUG] Resolving Root component from path: ${rootPath}, exportName: ${rootExportName}`);
      const rootResult = await resolveComponent({
        componentPath: rootPath,
        exportName: rootExportName,
        loader: loader as any,
      });
      if (rootResult.type === "error") {
        console.log(`[DEBUG] Root component resolution failed:`, rootResult.error);
        return {
          type: "error",
          error: rootResult.error,
          reason: `Root component resolution error: ${rootResult.error.message}`,
        };
      } else if (rootResult.type === "success") {
        console.log(`[DEBUG] Root component resolved successfully`);
        RootComponent = rootResult.component;
      }
    } else {
      console.log(`[DEBUG] Using default Root component (override: ${!!overrideRootComponent}, rootPath: ${rootPath})`);
    }

    // Resolve Html component (use override if provided, otherwise resolve from path)
    let HtmlComponent = overrideHtmlComponent || DefaultHtml;
    if (!overrideHtmlComponent && htmlPath) {
      console.log(`[DEBUG] Resolving Html component from path: ${htmlPath}, exportName: ${htmlExportName}`);
      const htmlResult = await resolveComponent({
        componentPath: htmlPath,
        exportName: htmlExportName,
        loader: loader as any,
      });
      if (htmlResult.type === "error") {
        console.log(`[DEBUG] Html component resolution failed:`, htmlResult.error);
        return {
          type: "error",
          error: htmlResult.error,
          reason: `Html component resolution error: ${htmlResult.error.message}`,
        };
      } else if (htmlResult.type === "success") {
        console.log(`[DEBUG] Html component resolved successfully`);
        HtmlComponent = htmlResult.component;
      }
    } else {
      console.log(`[DEBUG] Using default Html component (override: ${!!overrideHtmlComponent}, htmlPath: ${htmlPath})`);
    }

    return {
      type: "success",
      PageComponent,
      pageProps,
      RootComponent,
      HtmlComponent,
    };
  } catch (error) {
    return {
      type: "error",
      error: error as Error,
      reason: "Component resolution failed",
    };
  }
}; 