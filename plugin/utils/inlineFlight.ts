/**
 * inlineFlight.ts
 *
 * Single source of truth for the inline-flight <script> contract — the
 * non-executable element the browser's createReactFetcher reads on its first
 * call (see takeInlineFlight) to hydrate in place with no index.rsc round-trip.
 *
 * Shared by both emitters so the format can never drift:
 *  - build-time:   inlineFlightPayload (rewrites prerendered index.html files)
 *  - per-request:  createHtmlStreamWithInlineFlight (dynamic SSR)
 *
 * Node-side only (uses Buffer for base64); the browser only ever *reads* the
 * element, never builds it, so the dependency-free id lives in inlineFlightId.ts.
 */
import { INLINE_FLIGHT_ID } from "./inlineFlightId.js";

export { INLINE_FLIGHT_ID };

/**
 * Build the inline-flight <script> for a flight payload. base64-encoded so the
 * flight wire format can't collide with HTML/script parsing; `type` is a
 * non-JS mime so the browser never executes it (createReactFetcher reads its
 * textContent).
 */
export function buildInlineFlightScript(flight: Uint8Array): string {
  const base64 = Buffer.from(flight).toString("base64");
  return `<script type="text/x-component" id="${INLINE_FLIGHT_ID}" data-encoding="base64">${base64}</script>`;
}

/** Whether the HTML already carries an inline-flight script (idempotency guard). */
export function htmlHasInlineFlight(html: string): boolean {
  return html.includes(`id="${INLINE_FLIGHT_ID}"`);
}

/**
 * Insert the inline-flight script just before </body> (so it's parsed before
 * the deferred client module runs); fall back to appending if there's no
 * recognizable body. Idempotent — a no-op if the HTML already carries one.
 */
export function injectInlineFlightIntoHtml(
  html: string,
  flight: Uint8Array
): string {
  if (htmlHasInlineFlight(html)) return html;
  const scriptTag = buildInlineFlightScript(flight);
  const idx = html.lastIndexOf("</body>");
  if (idx !== -1) return html.slice(0, idx) + scriptTag + html.slice(idx);
  return html + scriptTag;
}
