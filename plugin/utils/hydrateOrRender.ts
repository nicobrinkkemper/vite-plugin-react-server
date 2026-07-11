import type { ReactNode } from "react";

export interface HydrateOrRenderOptions {
  /**
   * Called when `getInitialNode()` rejects (e.g. the initial RSC payload fails
   * to load). The default logs and leaves the prerendered static HTML in place,
   * so in-site links fall back to ordinary full-page navigation rather than the
   * page mounting a blank or broken tree. Provide your own to customize the
   * fallback.
   */
  onError?: (error: unknown) => void;
}

/**
 * #418-safe client mount for vprs apps.
 *
 * The prerendered / SSR'd shell is already sitting in `root` as static HTML. To
 * hydrate it in place without tripping React #418, the initial tree must be
 * FULLY RESOLVED before the first render — no pending thenable, no client-only
 * `<Suspense>` the server never rendered (either mismatches the prerendered
 * markup). This helper encodes that contract: it resolves `getInitialNode()` to
 * a concrete `ReactNode`, then mounts synchronously — `hydrateRoot` when the
 * shell is prerendered, `createRoot().render` when `root` is an empty client
 * shell.
 *
 * `react-dom/client` is imported lazily (in parallel with resolving the node) so
 * this module stays import-safe under the `react-server` condition — a static
 * import would drag `react-dom/client` into a server graph — matching the rest
 * of the `/utils` barrel.
 *
 * @example
 * import { createReactFetcher, hydrateOrRender } from "vite-plugin-react-server/utils";
 *
 * const root = document.getElementById("root");
 * if (root) {
 *   // Resolve the flight payload first, wrap it in your app shell, then mount.
 *   hydrateOrRender(root, async () => (
 *     <App initialNode={await createReactFetcher()} />
 *   ));
 * }
 */
export function hydrateOrRender(
  root: Element,
  getInitialNode: () => ReactNode | PromiseLike<ReactNode>,
  options: HydrateOrRenderOptions = {}
): void {
  const onError =
    options.onError ??
    ((error: unknown) =>
      console.error(
        "[vprs] hydrateOrRender: initial payload failed; staying static",
        error
      ));

  // Resolve the node and import react-dom/client concurrently; mount only once
  // BOTH are ready. Promise.all consumes both, so a rejection on either path
  // routes to onError without leaving a dangling unhandled rejection.
  Promise.all([
    Promise.resolve().then(getInitialNode),
    import("react-dom/client"),
  ])
    .then(([initialNode, mod]) => {
      // react-dom/client's default (browser) build is CJS. A production bundle
      // re-exports createRoot/hydrateRoot at the namespace top level, but Vite's
      // dev server serves the raw CJS module — a dynamic `import()` then lands
      // the exports on `.default`, where a static `import {}` would have been
      // rewritten by Vite's named-export interop. (This helper must stay a
      // dynamic import to remain load-safe under the react-server condition.)
      // Read the top level first (build), fall back to `.default` (dev).
      type ClientApi = Pick<typeof mod, "createRoot" | "hydrateRoot">;
      const client = mod as unknown as ClientApi & { default?: ClientApi };
      const createRoot = client.createRoot ?? client.default?.createRoot;
      const hydrateRoot = client.hydrateRoot ?? client.default?.hydrateRoot;
      if (!createRoot || !hydrateRoot) {
        throw new Error(
          "[vprs] react-dom/client did not expose createRoot/hydrateRoot " +
            "(neither at the module top level nor on `.default`)"
        );
      }
      // hasChildNodes(): a prerendered/SSR'd shell already holds the server
      // markup, so hydrate it; an empty client-only shell gets a fresh render.
      if (root.hasChildNodes()) {
        hydrateRoot(root, initialNode);
      } else {
        createRoot(root).render(initialNode);
      }
    })
    .catch(onError);
}
