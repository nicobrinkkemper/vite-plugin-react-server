import type { RendererMode } from "../vendor/lazyVendorModule.js";

/**
 * Guard against dev/prod renderer-vs-element mismatches.
 *
 * The vendored RSC renderer and the page's react/jsx-runtime each pick a
 * dev or prod variant from NODE_ENV at their own require time. When NODE_ENV
 * flips between the two (tooling that mutates it mid-process):
 *
 * - a DEVELOPMENT renderer handed PRODUCTION elements (no `_store`) dies
 *   deep inside React with "Cannot set properties of undefined (setting
 *   'validated')";
 * - a PRODUCTION renderer handed DEVELOPMENT elements crashes through the
 *   shared dispatcher with "dispatcher.getOwner is not a function".
 *
 * Neither stack names the actual cause. The lazy vendored require + react
 * pairing (lazyVendorModule.ts) makes both near-impossible to hit; this
 * check is the belt-and-braces diagnostic for the residual cases.
 *
 * Only PLAIN elements are checked: wrapper nodes (React.memo / lazy /
 * portal / context) legitimately carry no `_store` in development, so their
 * `$$typeof` values are excluded to avoid false positives on custom roots.
 */

const PLAIN_ELEMENT_TYPES = new Set<symbol>([
  Symbol.for("react.transitional.element"), // React 19
  Symbol.for("react.element"), // pre-19 naming, kept for safety
]);

function mismatchDirection(
  element: unknown,
  rendererMode: RendererMode | null
): "dev-renderer-prod-elements" | "prod-renderer-dev-elements" | null {
  if (rendererMode === null) return null;
  if (typeof element !== "object" || element === null) return null;
  const tag = (element as { $$typeof?: unknown }).$$typeof;
  if (typeof tag !== "symbol" || !PLAIN_ELEMENT_TYPES.has(tag)) return null;

  const hasStore = (element as { _store?: unknown })._store !== undefined;
  if (rendererMode === "development" && !hasStore) {
    return "dev-renderer-prod-elements";
  }
  if (rendererMode === "production" && hasStore) {
    return "prod-renderer-dev-elements";
  }
  return null;
}

export function assertRendererElementParity(
  element: unknown,
  rendererMode: RendererMode | null,
  context: string
): void {
  const direction = mismatchDirection(element, rendererMode);
  if (direction === null) return;

  const [rendererVariant, elementVariant, crash] =
    direction === "dev-renderer-prod-elements"
      ? [
          "DEVELOPMENT",
          "PRODUCTION",
          `"Cannot set properties of undefined (setting 'validated')"`,
        ]
      : [
          "PRODUCTION",
          "DEVELOPMENT",
          `"dispatcher.getOwner is not a function"`,
        ];

  throw new Error(
    `[vite-plugin-react-server] ${context}: the vendored RSC renderer was ` +
      `loaded as a ${rendererVariant} build, but this React element was ` +
      `created by a ${elementVariant} react/jsx-runtime. NODE_ENV changed ` +
      `between the renderer's first load and element creation (current ` +
      `NODE_ENV=${process.env["NODE_ENV"] ?? "<unset>"}). Pin NODE_ENV ` +
      `before importing vite-plugin-react-server or before the first ` +
      `build/render in this process, and avoid flipping it mid-process. ` +
      `Without this check the render dies inside React with ${crash}.`
  );
}
