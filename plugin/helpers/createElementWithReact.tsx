import type { CreateHandlerOptions } from "../types.js";

export type CreateElementWithReactOptions = Pick<
  CreateHandlerOptions,
  | "HtmlComponent"
  | "PageComponent"
  | "RootComponent"
  | "pageProps"
  | "moduleBase"
  | "moduleRootPath"
  | "moduleBasePath"
  | "moduleBaseURL"
  | "cssFiles"
  | "globalCss"
  | "route"
  | "manifest"
  | "projectRoot"
  | "url"
  | "as"
> &
  Partial<Pick<CreateHandlerOptions, "verbose" | "logger">>;

export type CreateElementWithReactFN = <
  R extends {
    Fragment: any;
    use: any;
    isValidElement: (element: any) => boolean;
  },
  ReturnType = React.ReactElement,
  Opt extends CreateElementWithReactOptions = CreateElementWithReactOptions
>(
  React: R,
  options: Opt
) => ReturnType;

export const createElementWithReact: CreateElementWithReactFN =
  function _createElementWithReact(
    React,
    {
      HtmlComponent,
      PageComponent,
      RootComponent,
      pageProps,
      moduleBase,
      moduleBaseURL,
      moduleBasePath,
      moduleRootPath,
      cssFiles = new Map(),
      globalCss = new Map(),
      route,
      manifest,
      projectRoot,
      url,
      as = "div",
      verbose = false,
      // No default logger: importing one from "vite" would drag the dev-only
      // bundler into the single-isolate edge bundle (this helper composes the
      // baked document tree). Call sites that want logs pass their own; the
      // verbose branches below are already `logger?.`-guarded.
      logger = undefined,
    }
  ) {
    // Add debug logging
    if (verbose) {
      logger?.info(
        `[createElementWithReact] Creating element for route: ${route}`
      );
      logger?.info(
        `[createElementWithReact] CSS files: ${cssFiles?.size || 0} files`
      );
      logger?.info(
        `[createElementWithReact] Global CSS: ${globalCss?.size || 0} files`
      );
    }

    if (
      HtmlComponent != null &&
      HtmlComponent !== React.Fragment &&
      HtmlComponent !== undefined
    ) {
      if (verbose) {
        logger?.info(`[createElementWithReact] Returning Full HTML structure`);
      }
      return (
        <HtmlComponent
          moduleBase={moduleBase}
          moduleBaseURL={moduleBaseURL}
          moduleBasePath={moduleBasePath}
          moduleRootPath={moduleRootPath}
          projectRoot={projectRoot}
          url={url || ""}
          route={route}
          pageProps={pageProps}
          cssFiles={cssFiles}
          globalCss={globalCss}
          Root={RootComponent ? RootComponent : React.Fragment}
          manifest={manifest}
          Page={PageComponent ? PageComponent : React.Fragment}
          as={as}
        />
      ) as never;
    } else if (RootComponent != null && RootComponent !== React.Fragment) {
      if (verbose) {
        logger?.info(`[createElementWithReact] Returning Root only`);
      }
      return (
        <RootComponent
          key={route}
          as={React.Fragment}
          cssFiles={cssFiles}
          pageProps={pageProps}
          Page={PageComponent ? PageComponent : React.Fragment}
        />
      ) as never;
    } else if (PageComponent != null && PageComponent !== React.Fragment) {
      if (verbose) {
        logger?.info(`[createElementWithReact] Returning Page only`);
      }
      return (<PageComponent {...pageProps} />) as never;
    }
    return null as never;
  };
