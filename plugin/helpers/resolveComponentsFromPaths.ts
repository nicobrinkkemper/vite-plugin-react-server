import type { PageComponentType, RootComponentType, HtmlComponentType, PagePropOpt } from "../types.js";
import type { React } from "../vendor/vendor.server.js";
import { Html as DefaultHtml } from "../components/html.js";
import { Root as DefaultRoot } from "../components/root.js";

export interface ComponentResolutionOptions {
  pagePath: string;
  rootPath?: string;
  htmlPath?: string;
  pageExportName: string;
  rootExportName: string;
  htmlExportName: string;
  projectRoot?: string;
  moduleRootPath?: string;
  moduleBasePath?: string;
  logger?: any;
  verbose?: boolean;
}

export interface ResolvedComponents {
  PageComponent: PageComponentType<PagePropOpt>;
  RootComponent: RootComponentType | typeof React.Fragment;
  HtmlComponent: HtmlComponentType | typeof React.Fragment | undefined;
}

/**
 * Resolves components from file paths for worker environments
 * 
 * This helper is used in workers where components need to be loaded dynamically
 * from file paths rather than being passed as React components directly.
 * 
 * ARCHITECTURE:
 * - Main thread: Has access to React components directly
 * - Worker threads: Need to load components from file paths
 * - This helper bridges the gap by loading components dynamically
 * 
 * @param options - Component resolution options including file paths
 * @returns Promise resolving to the loaded components
 */
export async function resolveComponentsFromPaths(
  options: ComponentResolutionOptions
): Promise<ResolvedComponents> {
  const {
    pagePath,
    rootPath,
    htmlPath,
    pageExportName,
    rootExportName,
    htmlExportName,
    logger,
    verbose = false,
  } = options;

  try {
    // Load PageComponent
    let PageComponent: PageComponentType<PagePropOpt> | undefined;
    if (pagePath) {
      const pageModule = await import(pagePath);
      PageComponent = pageModule[pageExportName];
      
      if (verbose && logger) {
        logger.info(`[component-resolver] Loaded PageComponent from ${pagePath}`);
      }
    }

    // Load RootComponent
    let RootComponent: RootComponentType | typeof React.Fragment = DefaultRoot;
    if (rootPath) {
      try {
        const rootModule = await import(rootPath);
        const loadedRootComponent = rootModule[rootExportName];
        if (loadedRootComponent) {
          RootComponent = loadedRootComponent;
          
          if (verbose && logger) {
            logger.info(`[component-resolver] Loaded RootComponent from ${rootPath}`);
          }
        }
      } catch (error) {
        if (verbose && logger) {
          logger.warn(`[component-resolver] Failed to load RootComponent from ${rootPath}, using default`);
        }
      }
    }

    // Load HtmlComponent
    let HtmlComponent: HtmlComponentType | typeof React.Fragment | undefined = DefaultHtml;
    if (htmlPath) {
      try {
        const htmlModule = await import(htmlPath);
        const loadedHtmlComponent = htmlModule[htmlExportName];
        if (loadedHtmlComponent) {
          HtmlComponent = loadedHtmlComponent;
          
          if (verbose && logger) {
            logger.info(`[component-resolver] Loaded HtmlComponent from ${htmlPath}`);
          }
        }
      } catch (error) {
        if (verbose && logger) {
          logger.warn(`[component-resolver] Failed to load HtmlComponent from ${htmlPath}, using default`);
        }
      }
    }

    return {
      PageComponent: PageComponent!,
      RootComponent,
      HtmlComponent,
    };
  } catch (error) {
    if (verbose && logger) {
      logger.error(`[component-resolver] Failed to resolve components:`, error);
    }
    throw error;
  }
}
