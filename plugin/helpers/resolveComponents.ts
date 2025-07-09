import { resolvePageAndProps } from "./resolvePageAndProps.js";
import { resolveComponent } from "./resolveComponent.js";
import { Root as DefaultRoot } from "../components/root.js";
import { Html as DefaultHtml } from "../components/html.js";
import { enhanceError } from "../error/enhanceError.js";
import type {
  PageComponentType,
  PagePropOpt,
  RootComponentType,
  HtmlComponentType,
} from "../types.js";
import { toError } from "../error/toError.js";
import type { CreateHandlerOptions } from "../types.js";
import { createLogger } from "vite";

export type ResolveComponentsOptions = Pick<
  CreateHandlerOptions,
  | "pagePath"
  | "pageExportName"
  | "propsPath"
  | "propsExportName"
  | "route"
  | "loader"
  | "moduleBaseURL"
  | "build"
  | "RootComponent"
  | "HtmlComponent"
  | "verbose"
  | "logger"
> & {
  rootPath?: string;
  htmlPath?: string;
  rootExportName?: string;
  htmlExportName?: string;
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

export type ResolveComponentsResult =
  | ResolveComponentsSuccess
  | ResolveComponentsError;

/**
 * Unified component resolution function that builds a complete components object.
 * Uses resolvePageAndProps internally and resolves Root/Html components alongside.
 */
export const resolveComponents = async ({
  pagePath,
  propsPath,
  rootPath,
  htmlPath,
  pageExportName = "Page",
  propsExportName = "props",
  rootExportName = "Root",
  htmlExportName = "Html",
  route,
  loader,
  moduleBaseURL,
  build,
  RootComponent: overrideRootComponent,
  HtmlComponent: overrideHtmlComponent,
  verbose,
  logger = createLogger(),
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
      moduleBaseURL,
      build,
    });

    if (pageAndPropsResult.type !== "success") {
      if (pageAndPropsResult.type === "error") {
        const enhancedError = enhanceError(
          pageAndPropsResult.error,
          resolveComponents,
          `resolveComponents(\"${route}\")`
        );

        return {
          type: "error",
          error: enhancedError,
          reason: "Page/props resolution failed",
        };
      }

      const skipError = new Error("Page/props resolution was skipped");
      Error.captureStackTrace(skipError, resolveComponents);

      return {
        type: "error",
        error: skipError,
        reason: "Page/props resolution was skipped",
      };
    }

    const { PageComponent, pageProps } = pageAndPropsResult;

    // Resolve Root component (use override if provided, otherwise resolve from path)
    let RootComponent = overrideRootComponent || DefaultRoot;
    if (!overrideRootComponent && rootPath) {
      if (verbose) {
        logger.info(
          `[resolveComponents] Resolving Root component from path: ${rootPath}, exportName: ${rootExportName}`
        );
      }
      const rootResult = await resolveComponent({
        componentPath: rootPath,
        exportName: rootExportName,
        loader: loader as any,
      });
      if (rootResult.type === "error") {
        if (verbose) {
          logger.error(
            `[resolveComponents] Root component resolution failed:`,
            { error: rootResult.error }
          );
        }
        // Fallback to default Root component
        RootComponent = DefaultRoot;
      } else if (rootResult.type === "success") {
        if (verbose) {
          logger.info(
            `[resolveComponents] Root component resolved successfully`
          );
        }
        RootComponent = rootResult.component;
      }
    }

    // Resolve Html component (use override if provided, otherwise resolve from path)
    let HtmlComponent = overrideHtmlComponent || DefaultHtml;
    if (!overrideHtmlComponent && htmlPath) {
      if (verbose) {
        logger.info(
          `[resolveComponents] Resolving Html component from path: ${htmlPath}, exportName: ${htmlExportName}`
        );
      }
      const htmlResult = await resolveComponent({
        componentPath: htmlPath,
        exportName: htmlExportName,
        loader: loader as any,
      });
      if (htmlResult.type === "error") {
        if (verbose) {
          logger.error(
            `[resolveComponents] Html component resolution failed:`,
            { error: htmlResult.error }
          );
        }
        // Fallback to default Html component
        HtmlComponent = DefaultHtml;
      } else if (htmlResult.type === "success") {
        if (verbose) {
          logger.info(
            `[resolveComponents] Html component resolved successfully`
          );
        }
        HtmlComponent = htmlResult.component;
      }
    } else {
      if (verbose) {
        logger.info(
          `[resolveComponents] Using default Html component (override: ${!!overrideHtmlComponent}, htmlPath: ${htmlPath})`
        );
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
    const enhancedError = enhanceError(
      toError(error),
      resolveComponents,
      `resolveComponents(\"${route}\")`
    );

    return {
      type: "error",
      error: enhancedError,
      reason: "Component resolution failed",
    };
  }
};
