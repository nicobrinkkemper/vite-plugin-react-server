import { ReactDOMServer } from "../vendor/vendor.server.js";

type TemporaryReferenceSet = ReturnType<
  typeof ReactDOMServer.createTemporaryReferenceSet
>;

// LAZY: this module is reached at plugin-import time (orchestrator chain).
// Creating the reference set there would touch the vendored renderer and lock
// its dev/prod variant to NODE_ENV-at-import — the exact mismatch the lazy
// vendor modules exist to prevent (see vendor/lazyVendorModule.ts). Defer the
// createTemporaryReferenceSet() call to first use (build/render time).
let lazySet: TemporaryReferenceSet | null = null;
const ensure = (): TemporaryReferenceSet =>
  (lazySet ??= ReactDOMServer.createTemporaryReferenceSet());

export const temporaryReferences = new Proxy({} as TemporaryReferenceSet, {
  get(_target, prop) {
    const target = ensure() as any;
    const value = target[prop];
    // Map-like methods need the real set as `this`
    return typeof value === "function" ? value.bind(target) : value;
  },
  has: (_target, prop) => prop in (ensure() as any),
});
