import type { CreateHandlerOptions } from "../types.js";
import type { ResolvedLayoutLayer } from "./resolveLayoutChain.js";
import { mergeHead } from "../router/head.js";

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

    // Whether this compose renders the full HTML document (static snapshot /
    // edge document) or a headless tree (the hydration + client-nav flight).
    const isDocumentRender =
      HtmlComponent != null && HtmlComponent !== React.Fragment;

    // Nested layouts: fold the root→leaf segment chain around the leaf page so
    // `<L0 {...p0}><L1 {...p1}><Page {...leafProps}/>…` renders as one tree.
    // Each segment wraps as Layout → ErrorBoundary → Suspense(Loading) →
    // children (Next's layout/error/loading nesting order), so a segment's
    // boundary catches its children but not its own layout.
    //
    // The chain's merged `head.ts` contribution is delivered two ways:
    // - DOCUMENT renders get raw hoistable tags — react-dom hoists them into
    //   the snapshot's <head> and out of the #root markup, so hydration never
    //   sees them.
    // - Every render (document and headless alike) gets an inert
    //   `<template data-vprs-head>` carrying the merged head as JSON; the
    //   client router reads it after hydration and after each navigation and
    //   applies title/meta imperatively. Hoistables must NOT ride the
    //   headless flight: when hydration suspends on a client-reference chunk
    //   React re-inserts them instead of adopting the server copies —
    //   duplicated <title>/<meta> plus hydration error #418, on both React
    //   trains. The template renders identically on both sides, so the #root
    //   markup stays hydration-consistent.
    //
    // The composed component takes the leaf's props (Root/Html render it as
    // `<Page {...pageProps}/>`); each layer closes over its own resolved props.
    // No layers → the leaf page passes through unchanged, so every branch below
    // stays byte-identical for the flat case.
    const EffectivePage =
      layoutChain && layoutChain.length && PageComponent
        ? function ComposedPage(leafProps: Record<string, unknown>) {
            const create = (React as unknown as { createElement: Function })
              .createElement;
            const Suspense = (React as unknown as { Suspense?: unknown })
              .Suspense;
            const head = mergeHead(layoutChain.map((l) => l.head));
            const hasHead =
              head.title !== undefined ||
              (head.meta?.length ?? 0) > 0 ||
              (head.links?.length ?? 0) > 0;
            const headTags =
              isDocumentRender && hasHead
                ? [
                    head.title !== undefined
                      ? create("title", { key: "head-title" }, head.title)
                      : null,
                    ...(head.meta ?? []).map((m, i) =>
                      create("meta", { key: `head-meta-${i}`, ...m })
                    ),
                    ...(head.links ?? []).map((l, i) =>
                      create("link", { key: `head-link-${i}`, ...l })
                    ),
                  ].filter(Boolean)
                : [];
            const headData = hasHead
              ? create("template", {
                  key: "head-data",
                  "data-vprs-head": JSON.stringify(head),
                })
              : null;
            const leaf =
              headTags.length || headData
                ? create(
                    React.Fragment,
                    null,
                    ...headTags,
                    headData,
                    create(PageComponent, leafProps)
                  )
                : create(PageComponent, leafProps);
            return layoutChain.reduceRight((child, layer) => {
              let node = child;
              if (layer.Loading && Suspense) {
                node = create(
                  Suspense,
                  { fallback: create(layer.Loading, null) },
                  node
                );
              }
              if (layer.ErrorBoundary) {
                node = create(layer.ErrorBoundary, null, node);
              }
              if (layer.Component) {
                node = create(layer.Component, layer.props, node);
              }
              return node;
            }, leaf);
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
        // Deliberately NO key here. This element is the flight root the client
        // router swaps on navigation; keying it by route tells React to unmount
        // and remount the ENTIRE page tree on every client nav — CSS animations
        // restart, client-component state dies, no DOM is ever preserved.
        // Unkeyed, React reconciles the old and new trees and structure that
        // matches across routes (headers, logos, nav) is updated in place. A
        // page that WANTS a clean remount can key its own subtree.
        <RootComponent
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
