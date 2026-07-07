import type { CreateHandlerOptions } from "../types.js";
import type { ResolvedLayoutLayer } from "./resolveLayoutChain.js";

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
  Partial<Pick<CreateHandlerOptions, "verbose" | "logger">> & {
    /**
     * Ordered root→leaf `route.tsx` layout layers wrapping the leaf page. When
     * present, the page is composed as `<L0 {...p0}><L1 {...p1}><Page/>…` so the
     * nested tree streams as one flight (the client renders it for free). Resolved
     * by {@link resolveLayoutChain}; empty/absent for an unwrapped page.
     */
    layoutChain?: ResolvedLayoutLayer[];
  };

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
      layoutChain,
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

    // Nested layouts: fold the root→leaf `route.tsx` chain around the leaf page
    // so `<L0 {...p0}><L1 {...p1}><Page {...leafProps}/>…` renders as one tree.
    // The composed component takes the leaf's props (Root/Html render it as
    // `<Page {...pageProps}/>`); each layer closes over its own resolved props.
    // No layers → the leaf page passes through unchanged, so every branch below
    // stays byte-identical for the flat case.
    const EffectivePage =
      layoutChain && layoutChain.length && PageComponent
        ? function ComposedPage(leafProps: Record<string, unknown>) {
            const create = (React as unknown as { createElement: Function })
              .createElement;
            return layoutChain.reduceRight(
              (child, layer) => create(layer.Component, layer.props, child),
              create(PageComponent, leafProps)
            );
          }
        : PageComponent;

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
          Page={EffectivePage ? EffectivePage : React.Fragment}
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
          Page={EffectivePage ? EffectivePage : React.Fragment}
        />
      ) as never;
    } else if (PageComponent != null && PageComponent !== React.Fragment) {
      if (verbose) {
        logger?.info(`[createElementWithReact] Returning Page only`);
      }
      const Composed = EffectivePage as typeof PageComponent;
      return (<Composed {...pageProps} />) as never;
    }
    return null as never;
  };
