import type { HtmlTagDescriptor, Logger, ViteDevServer } from "vite";
import { extractHeadTagsFromFlight } from "./devShellHeadFlight.js";

/**
 * Lazy, cached provider of the document's head for the dev shell. The
 * request-handler side owns the actual render (it holds the worker
 * lifecycle); this module owns caching, the warn-once fallback, and the
 * server→provider registry the transformIndexHtml hooks read from.
 *
 * Contract with the hooks: getTags NEVER rejects and never blocks beyond the
 * render timeout — on any failure it resolves [] and the dev shell is served
 * unchanged, exactly as before the feature. The first HTML request pays the
 * render; subsequent ones hit the cache until invalidate() (the Html-module
 * hotUpdate signal) clears it, and the NEXT request re-renders lazily.
 */

export type DevShellHeadProvider = {
  getTags: () => Promise<HtmlTagDescriptor[]>;
  invalidate: () => void;
};

const providers = new WeakMap<ViteDevServer, DevShellHeadProvider>();

const RENDER_TIMEOUT_MS = 5_000;

export function createDevShellHeadProvider(
  server: ViteDevServer,
  renderShellFlight: () => Promise<string>,
  logger: Logger
): DevShellHeadProvider {
  let cache: HtmlTagDescriptor[] | null = null;
  let inflight: Promise<HtmlTagDescriptor[]> | null = null;
  let warned = false;

  const provider: DevShellHeadProvider = {
    async getTags() {
      if (cache) return cache;
      if (!inflight) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        inflight = Promise.race([
          renderShellFlight(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`shell render timed out after ${RENDER_TIMEOUT_MS}ms`)),
              RENDER_TIMEOUT_MS
            );
            timer.unref?.();
          }),
        ])
          .then((payload) => {
            const tags = extractHeadTagsFromFlight(payload);
            cache = tags;
            return tags;
          })
          .catch((error) => {
            if (!warned) {
              warned = true;
              logger.warn(
                `[vite-plugin-react-server] dev-shell head render failed; serving index.html unchanged: ` +
                  String(error instanceof Error ? error.message : error)
              );
            }
            return [] as HtmlTagDescriptor[];
          })
          .finally(() => {
            clearTimeout(timer);
            inflight = null;
          });
      }
      return inflight;
    },
    invalidate() {
      cache = null;
    },
  };

  providers.set(server, provider);
  return provider;
}

export const getDevShellHeadProvider = (
  server: ViteDevServer | undefined
): DevShellHeadProvider | undefined =>
  server ? providers.get(server) : undefined;
