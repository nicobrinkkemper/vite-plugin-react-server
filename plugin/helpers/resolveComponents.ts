import { resolvePageAndProps } from "./resolvePageAndProps.js";
import { resolveComponent } from "./resolveComponent.js";
import { Root as DefaultRoot } from "../components/root.js";
import { Html as DefaultHtml } from "../components/html.js";
import type { BuildModuleLoader, ResolvedUserOptions, PageComponentType, PagePropOpt, RootComponentType, HtmlComponentType, GenericModuleLoader } from "../types.js";

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
  RootComponent?: RootComponentType;
  HtmlComponent?: HtmlComponentType;
  verbose: boolean;
};

export type ResolveComponentsSuccess = {
  type: "success";
  PageComponent: PageComponentType<PagePropOpt>;
  pageProps: PagePropOpt;
  RootComponent: RootComponentType;
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
  verbose,
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
      if (verbose) {
        console.log(`[resolveComponents] Resolving Root component from path: ${rootPath}, exportName: ${rootExportName}`);
      }
      const rootResult = await resolveComponent({
        componentPath: rootPath,
        exportName: rootExportName,
        loader: loader as any,
      });
      if (rootResult.type === "error") {
        if (verbose) {
          console.log(`[resolveComponents] Root component resolution failed:`, rootResult.error);
        }
        // Fallback to default Root component
        RootComponent = DefaultRoot;
      } else if (rootResult.type === "success") {
        if (verbose) {
          console.log(`[resolveComponents] Root component resolved successfully`);
        }
        RootComponent = rootResult.component;
      }
    } else {
      if (verbose) {
        console.log(`[resolveComponents] Using default Root component (override: ${!!overrideRootComponent}, rootPath: ${rootPath})`);
      }
    }

    // Resolve Html component (use override if provided, otherwise resolve from path)
    let HtmlComponent = overrideHtmlComponent || DefaultHtml;
    if (!overrideHtmlComponent && htmlPath) {
      if (verbose) {
        console.log(`[resolveComponents] Resolving Html component from path: ${htmlPath}, exportName: ${htmlExportName}`);
      }
      const htmlResult = await resolveComponent({
        componentPath: htmlPath,
        exportName: htmlExportName,
        loader: loader as any,
      });
      if (htmlResult.type === "error") {
        if (verbose) {
          console.log(`[resolveComponents] Html component resolution failed:`, htmlResult.error);
        }
        // Fallback to default Html component
        HtmlComponent = DefaultHtml;
      } else if (htmlResult.type === "success") {
        if (verbose) {
          console.log(`[resolveComponents] Html component resolved successfully`);
        }
        HtmlComponent = htmlResult.component;
      }
    } else {
      if (verbose) {
        console.log(`[resolveComponents] Using default Html component (override: ${!!overrideHtmlComponent}, htmlPath: ${htmlPath})`);
      }
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