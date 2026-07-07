import type { GenericModuleLoader } from "../types.js";
import type { RouteLayer } from "../router/scanRoutes.js";
import { resolvePage } from "./resolvePage.js";
import { resolveProps, type LoaderCtx } from "./resolveProps.js";

/**
 * One resolved layer of a route's nested-layout chain: the loaded `route.tsx`
 * layout component plus its (already-invoked) loader props. `createElementWithReact`
 * folds these root→leaf around the leaf page — `<L0 {...p0}><L1 {...p1}>{page}…`.
 */
export type ResolvedLayoutLayer = {
  Component: unknown;
  props: Record<string, unknown>;
};

export interface ResolveLayoutChainOptions {
  /** Ordered root→leaf `route.tsx` layers for the matched page (from scanRoutes). */
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

/**
 * Resolve a matched route's `route.tsx` layout chain into loaded components +
 * props, preserving root→leaf order. Each layer is loaded via the same module
 * loader as the page; a layer whose `route.tsx` doesn't export the layout is
 * skipped (rendered as a passthrough) so a partially-authored tree still renders.
 * Layers resolve in parallel — each gets its own `{ params, request }` — mirroring
 * the page/props resolution in {@link resolvePageAndProps}.
 */
export async function resolveLayoutChain(
  opts: ResolveLayoutChainOptions
): Promise<ResolvedLayoutLayer[]> {
  const { layouts, url, ctx, loader, layoutExportName, propsExportName } = opts;
  if (!layouts?.length) return [];

  const resolved = await Promise.all(
    layouts.map(async (layer): Promise<ResolvedLayoutLayer | null> => {
      // Layout component: a `route.tsx` export (default "Layout").
      const componentResult = await resolvePage({
        id: layer.component,
        exportName: layoutExportName,
        loader,
      });
      if (componentResult.type !== "success") {
        opts.logger?.warn(
          `[resolveLayoutChain] ${layer.component} has no "${layoutExportName}" export; skipping layer`
        );
        return null;
      }
      const Component = componentResult.module[layoutExportName];
      if (Component == null) {
        opts.logger?.warn(
          `[resolveLayoutChain] ${layer.component} "${layoutExportName}" export is empty; skipping layer`
        );
        return null;
      }

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
        if (propsResult.type === "success" && propsResult.module) {
          let value = propsResult.module[
            propsExportName as keyof typeof propsResult.module
          ] as unknown;
          if (typeof value === "function") {
            try {
              value = (value as (u: string, c: LoaderCtx) => unknown)(url, ctx);
              if (value instanceof Promise) value = await value;
            } catch {
              value = {};
            }
          }
          if (value && typeof value === "object") {
            props = value as Record<string, unknown>;
          }
        }
      }

      return { Component, props };
    })
  );

  // Drop skipped layers (missing export); keep root→leaf order.
  return resolved.filter((l): l is ResolvedLayoutLayer => l !== null);
}
