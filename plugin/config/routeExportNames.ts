/**
 * Route-surface name defaults, in a dependency-free leaf.
 *
 * These live outside defaults.tsx because DEFAULT_CONFIG's module evaluates the
 * whole config layer (the rsl transformer, root probes, condition sniffing) at
 * import — side effects rollup cannot shake out. Modules that ride into baked
 * edge bundles (resolvePageAndProps, the edge handler) need these four strings
 * and nothing else, so importing them from here keeps the entire config layer
 * out of those bundles. defaults.tsx composes DEFAULT_CONFIG from these same
 * values, so there is one source of truth.
 */

/** Export name a page module publishes its component under. */
export const PAGE_EXPORT_NAME = "Page";
/** Export name a props module publishes its loader under. */
export const PROPS_EXPORT_NAME = "props";
/** Export name a `route.tsx` layout publishes its component under. */
export const LAYOUT_EXPORT_NAME = "Layout";
/** Export name an `error.tsx` publishes its client boundary under. */
export const ERROR_EXPORT_NAME = "ErrorBoundary";
/** Export name a `loading.tsx` publishes its Suspense fallback under. */
export const LOADING_EXPORT_NAME = "Loading";
/** Export name a `head.ts` publishes its head contribution under. */
export const HEAD_EXPORT_NAME = "head";
/** Filename the client router fetches a route's flight from. */
export const RSC_OUTPUT_PATH = "index.rsc";
