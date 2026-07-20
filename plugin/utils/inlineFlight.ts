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
 * Runtime-agnostic: base64 rides Buffer where it exists (Node — fastest for
 * large payloads) and chunked btoa elsewhere (workerd/Deno have no Buffer, and
 * the per-request edge handler builds the element there). The browser only
 * ever *reads* the element, never builds it, so the dependency-free id lives
 * in inlineFlightId.ts.
 */
import {
  INLINE_FLIGHT_ID,
  INLINE_FLIGHT_LENGTH_ATTR,
} from "./inlineFlightId.js";

export { INLINE_FLIGHT_ID, INLINE_FLIGHT_LENGTH_ATTR };

/**
 * Build the inline-flight <script> for a flight payload. base64-encoded so the
 * flight wire format can't collide with HTML/script parsing; `type` is a
 * non-JS mime so the browser never executes it (createReactFetcher reads its
 * textContent).
 *
 * `data-length` stamps how many characters the payload has, so the reader can
 * tell a whole element from a half-written one — see INLINE_FLIGHT_LENGTH_ATTR.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const B = (globalThis as { Buffer?: typeof Buffer }).Buffer;
  if (B?.from) return B.from(bytes).toString("base64");
  // btoa takes a binary string; build it in slices — a single
  // String.fromCharCode(...bytes) blows the argument limit on large payloads.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function buildInlineFlightScript(flight: Uint8Array): string {
  const base64 = bytesToBase64(flight);
  return `<script type="text/x-component" id="${INLINE_FLIGHT_ID}" data-encoding="base64" ${INLINE_FLIGHT_LENGTH_ATTR}="${base64.length}">${base64}</script>`;
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
