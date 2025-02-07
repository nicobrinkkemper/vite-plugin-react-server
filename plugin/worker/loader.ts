/**
 * Extension point for custom module loading in the worker thread.
 * This file can be overridden via the plugin options:
 *
 * ```ts
 * reactStreamPlugin({
 *   loaderPath: './my-custom-loader.ts'
 * })
 * ```
 *
 * The default loader provides basic module loading functionality.
 * Override this if you need custom module resolution or transformation.
 */
export function load(id: string) {
  return import(id);
}
