import type { GenericModuleLoader } from "../types.js";
import type { RouteLayer } from "../router/scanRoutes.js";
import type { RouteHeadContribution, RouteHeadExport } from "../router/head.js";
import {
  ERROR_EXPORT_NAME,
  HEAD_EXPORT_NAME,
  LOADING_EXPORT_NAME,
} from "../config/routeExportNames.js";
import { isLoaderSignal } from "../router/loaderSignals.js";
import { resolvePage } from "./resolvePage.js";
import { resolveProps, type LoaderCtx } from "./resolveProps.js";

/**
 * One resolved layer of a route's nested-layout chain: the loaded `route.tsx`
 * layout component plus its (already-invoked) loader props, and the segment's
 * optional boundaries/head. `createElementWithReact` folds these root→leaf
 * around the leaf page — `<L0 {...p0}><L1 {...p1}>{page}…`, wrapping each
 * segment as `<Layout><ErrorBoundary><Suspense fallback={<Loading/>}>…`.
 */
export type ResolvedLayoutLayer = {
  /** The `route.tsx` layout, absent for a boundaries/head-only layer. */
  Component?: unknown;
  props: Record<string, unknown>;
  /** The `error.tsx` client boundary (a client reference at compose time). */
  ErrorBoundary?: unknown;
  /** The `loading.tsx` Suspense fallback component. */
  Loading?: unknown;
  /** The `head.ts` contribution, already evaluated against loader data. */
  head?: RouteHeadContribution;
};

export interface ResolveLayoutChainOptions {
  /** Ordered root→leaf segment layers for the matched page (from scanRoutes). */
  layouts: RouteLayer[];
  /** Request url, passed to each layer's `props(url, ctx)` loader. */
  url: string;
  /** Loader context (`{ params, request }`) threaded into every layer loader. */
  ctx: LoaderCtx;
  /** Module loader (worker/dev/build supply their own). */
  loader: GenericModuleLoader;
  /** Export name a `route.tsx` uses for its layout component (default "Layout"). */
  layoutExportName: string;
  /** Export name a layer's `props.ts` uses (default "props"). */
  propsExportName: string;
  verbose?: boolean;
  logger?: { info: (m: string) => void; warn: (m: string) => void } | undefined;
}

/** Load one optional component module (error boundary / loading fallback). */
const loadComponent = async (
  id: string,
  exportName: string,
  loader: GenericModuleLoader,
  logger?: { warn: (m: string) => void },
): Promise<unknown> => {
  const result = await resolvePage({ id, exportName, loader });
  if (result.type !== "success" || result.module[exportName] == null) {
    logger?.warn(
      `[resolveLayoutChain] ${id} has no "${exportName}" export; skipping`,
    );
    return undefined;
  }
  return result.module[exportName];
};

/**
 * Resolve a matched route's segment-layer chain into loaded components +
 * props, preserving root→leaf order. Each layer is loaded via the same module
 * loader as the page; a file whose expected export is missing is skipped (the
 * layer renders as a passthrough) so a partially-authored tree still renders.
 * Layers resolve in parallel — each gets its own `{ params, request }` —
 * mirroring the page/props resolution in {@link resolvePageAndProps}.
 */
export async function resolveLayoutChain(
  opts: ResolveLayoutChainOptions
): Promise<ResolvedLayoutLayer[]> {
  const { layouts, url, ctx, loader, layoutExportName, propsExportName } = opts;
  if (!layouts?.length) return [];

  const resolved = await Promise.all(
    layouts.map(async (layer): Promise<ResolvedLayoutLayer | null> => {
      // Layout component: a `route.tsx` export (default "Layout"). A layer may
      // carry only boundaries/head — no component means passthrough.
      let Component: unknown;
      if (layer.component) {
        Component = await loadComponent(
          layer.component,
          layoutExportName,
          loader,
          opts.logger,
        );
      }

      const [ErrorBoundary, Loading] = await Promise.all([
        layer.error
          ? loadComponent(layer.error, ERROR_EXPORT_NAME, loader, opts.logger)
          : undefined,
        layer.loading
          ? loadComponent(layer.loading, LOADING_EXPORT_NAME, loader, opts.logger)
          : undefined,
      ]);

      // Layer props: the segment's `props.ts` (shared with its page). Absent →
      // no props. A function export is the loader form `props(url, { params })`.
      let props: Record<string, unknown> = {};
      if (layer.props) {
        const propsResult = await resolveProps({
          id: layer.props,
          url,
          exportName: propsExportName,
          loader,
          ctx,
        });
        // resolveProps invokes a function loader itself and catches its throw
        // into an error result — surface a redirect()/notFound() signal from
        // there as control flow.
        if (
          propsResult.type === "error" &&
          isLoaderSignal(propsResult.error)
        ) {
          throw propsResult.error;
        }
        if (propsResult.type === "success" && propsResult.module) {
          let value = propsResult.module[
            propsExportName as keyof typeof propsResult.module
          ] as unknown;
          if (typeof value === "function") {
            try {
              value = (value as (u: string, c: LoaderCtx) => unknown)(url, ctx);
              if (value instanceof Promise) value = await value;
            } catch (error) {
              // redirect()/notFound() from a layout loader is control flow —
              // propagate so the request pipeline translates it.
              if (isLoaderSignal(error)) throw error;
              value = {};
            }
          }
          if (value && typeof value === "object") {
            props = value as Record<string, unknown>;
          }
        }
      }

      // Head contribution: a `head.ts` static object or per-request function
      // receiving the segment's params + resolved loader data.
      let head: RouteHeadContribution | undefined;
      if (layer.head) {
        try {
          const headModule = await loader(layer.head);
          let value = headModule?.[HEAD_EXPORT_NAME] as RouteHeadExport | undefined;
          if (typeof value === "function") {
            const out = value({ url, params: ctx.params ?? {}, data: props });
            value = out instanceof Promise ? await out : out;
          }
          if (value && typeof value === "object") head = value;
          else if (value !== undefined) {
            opts.logger?.warn(
              `[resolveLayoutChain] ${layer.head} "${HEAD_EXPORT_NAME}" export is not an object; skipping`,
            );
          }
        } catch (error) {
          if (isLoaderSignal(error)) throw error;
          opts.logger?.warn(
            `[resolveLayoutChain] failed to load head module ${layer.head}: ${error}`,
          );
        }
      }

      if (!Component && !ErrorBoundary && !Loading && !head) return null;
      return { Component, props, ErrorBoundary, Loading, head };
    })
  );

  // Drop empty layers (all expected exports missing); keep root→leaf order.
  return resolved.filter((l): l is ResolvedLayoutLayer => l !== null);
}
