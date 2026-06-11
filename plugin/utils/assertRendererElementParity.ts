import type { RendererMode } from "../vendor/lazyVendorModule.js";

/**
 * Guard against the dev-renderer/prod-element mismatch.
 *
 * The vendored RSC renderer and the page's react/jsx-runtime each pick a
 * dev or prod variant from NODE_ENV at their own require time. When NODE_ENV
 * flips between the two (tooling that mutates it mid-process), a DEVELOPMENT
 * renderer can be handed PRODUCTION-shaped elements (no `_store`) and dies
 * deep inside React with "Cannot set properties of undefined (setting
 * 'validated')" — nothing in that stack names the actual cause.
 *
 * The lazy vendored require (lazyVendorModule.ts) makes this near-impossible
 * to hit; this check is the belt-and-braces diagnostic for the residual
 * cases (e.g. NODE_ENV flipped again after the first render).
 */
export function assertRendererElementParity(
  element: unknown,
  rendererMode: RendererMode | null,
  context: string
): void {
  if (rendererMode !== "development") return;
  if (typeof element !== "object" || element === null) return;
  if (!("$$typeof" in element)) return;
  if ((element as { _store?: unknown })._store !== undefined) return;

  throw new Error(
    `[vite-plugin-react-server] ${context}: the vendored RSC renderer was ` +
      `loaded as a DEVELOPMENT build, but this React element was created by a ` +
      `PRODUCTION react/jsx-runtime (no _store). NODE_ENV changed between the ` +
      `renderer's first load and element creation (current NODE_ENV=` +
      `${process.env["NODE_ENV"] ?? "<unset>"}). Pin NODE_ENV before importing ` +
      `vite-plugin-react-server or before the first build/render in this ` +
      `process, and avoid flipping it mid-process. Without this check the ` +
      `render dies inside React with "Cannot set properties of undefined ` +
      `(setting 'validated')".`
  );
}
