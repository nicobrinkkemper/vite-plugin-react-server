import { ReactDOMServer } from "../vendor/vendor.server.js";

type TemporaryReferenceSet = ReturnType<
  typeof ReactDOMServer.createTemporaryReferenceSet
>;

/**
 * LAZY temporary-reference sets.
 *
 * Calling createTemporaryReferenceSet() at module scope would touch the
 * vendored renderer at plugin-import time and lock its dev/prod variant to
 * NODE_ENV-at-import — the exact mismatch the lazy vendor modules exist to
 * prevent (see vendor/lazyVendorModule.ts). The proxy defers the call to
 * first use (build/render time).
 *
 * Proxy semantics: method lookups return BOUND methods, cached per property
 * so identity is stable and hot build paths don't allocate per call. Writes
 * and deletes forward to the real set. This is NOT a real WeakMap instance
 * (`instanceof` is false, internal-slot calls like
 * `WeakMap.prototype.has.call(proxy, k)` throw) — never hand it to APIs
 * that brand-check; in-repo consumers only call .has/.get/.set/.delete.
 */
export function createLazyTemporaryReferenceSet(): TemporaryReferenceSet {
  let lazySet: TemporaryReferenceSet | null = null;
  const bound = new Map<PropertyKey, unknown>();
  const ensure = (): TemporaryReferenceSet =>
    (lazySet ??= ReactDOMServer.createTemporaryReferenceSet());

  return new Proxy({} as TemporaryReferenceSet, {
    get(_target, prop) {
      const target = ensure() as any;
      const value = target[prop];
      if (typeof value !== "function") return value;
      let fn = bound.get(prop);
      if (fn === undefined) {
        fn = value.bind(target);
        bound.set(prop, fn);
      }
      return fn;
    },
    has: (_target, prop) => prop in (ensure() as any),
    set(_target, prop, value) {
      (ensure() as any)[prop] = value;
      return true;
    },
    deleteProperty(_target, prop) {
      delete (ensure() as any)[prop];
      return true;
    },
  });
}

export const temporaryReferences = createLazyTemporaryReferenceSet();
