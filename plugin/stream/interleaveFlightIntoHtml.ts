/**
 * Interleave a flight payload into an HTML stream as it renders — the
 * `inlineFlight: "stream"` delivery shape. Where the "blob" shape buffers the
 * whole document and splices one non-executable script before `</body>`, this
 * transform passes HTML through as it arrives and injects each flight chunk as
 * an executable `<script>(self.__vprsFlightChunks||=[]).push("<base64>")
 * </script>` at the next safe point, closing with a `push(null)` sentinel.
 * TTFB is the shell flush, the server never holds the whole document or
 * payload, and Suspense reveals progressively. (Not fully backpressured:
 * a consumer slower than the producers queues chunks in the stream
 * controller — see the contract limits below.)
 *
 * Web-standard by construction (ReadableStream + TextEncoder only, no node:*):
 * this must run on workerd/Deno/Vercel Edge as-is.
 *
 * Ordering guarantees:
 *  - no flight script is emitted until the `<body` open tag has been emitted
 *    (a headless fragment without one gets its scripts appended at the end);
 *  - flight chunks are emitted in flight order;
 *  - the document's closing `</body></html>` trailer is held back and
 *    re-emitted after the last flight script, so every script parses inside
 *    `<body>`.
 *
 * Byte-level care: the trailer search runs on bytes (no decode — a decode
 * boundary could split a multi-byte character), and the holdback boundary is
 * moved back to a UTF-8 character start so a script is never spliced
 * mid-character into the byte stream.
 *
 * Contract limits (byte matching is structure-blind by design):
 *  - a literal `<body` in head-side content (a comment, a code sample) opens
 *    the flight gate early, and a literal `</body>` inside the final holdback
 *    window reads as the trailer — such documents get their scripts
 *    mis-placed (they still parse and execute);
 *  - bytes appended after `</html>` by an upstream transform (beyond the
 *    holdback window) scroll the real trailer out of reach and scripts
 *    append at the very end instead;
 *  - the trailer is held until the flight stream ENDS: bound a stallable
 *    producer upstream (htmlTimeout / request signal) — this transform
 *    imposes no deadline of its own;
 *  - pumps are push-based: a consumer slower than the producers queues in
 *    the stream controller rather than pausing the render;
 *  - matching assumes an ASCII-compatible (UTF-8) document.
 *
 * The chunk scripts are EXECUTABLE (unlike the blob's inert
 * `text/x-component` element): under a `script-src` nonce policy pass
 * `nonce`, or every chunk is blocked and the payload never reaches the
 * reader.
 */
import { bytesToBase64 } from "../utils/inlineFlight.js";
import { INLINE_FLIGHT_STREAM_GLOBAL } from "../utils/inlineFlightId.js";

const encoder = new TextEncoder();

const BODY_CLOSE = new Uint8Array([0x3c, 0x2f, 0x62, 0x6f, 0x64, 0x79, 0x3e]); // "</body>"
const BODY_OPEN = new Uint8Array([0x3c, 0x62, 0x6f, 0x64, 0x79]); // "<body"

// Enough to hold "</body></html>" plus stray trailing whitespace.
const TRAILER_HOLDBACK = 32;

// Nonce values are token-like by spec (base64ish); refuse anything that could
// break out of the attribute.
const SAFE_NONCE_RE = /^[\w+/=-]+$/;

function scriptOpen(nonce?: string): string {
  if (!nonce) return "<script>";
  if (!SAFE_NONCE_RE.test(nonce)) {
    throw new Error(
      "interleaveFlightIntoHtmlStream: nonce contains characters outside the CSP nonce alphabet"
    );
  }
  return `<script nonce="${nonce}">`;
}

function chunkScript(base64: string, nonce?: string): Uint8Array {
  return encoder.encode(
    `${scriptOpen(nonce)}(self.${INLINE_FLIGHT_STREAM_GLOBAL}||=[]).push("${base64}")</script>`
  );
}

function doneScript(nonce?: string): Uint8Array {
  return encoder.encode(
    `${scriptOpen(nonce)}(self.${INLINE_FLIGHT_STREAM_GLOBAL}||=[]).push(null)</script>`
  );
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.byteLength === 0) return b;
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

/** Index where "</body>" last starts in `bytes`, or -1. */
function lastIndexOfBodyClose(bytes: Uint8Array): number {
  outer: for (let i = bytes.byteLength - BODY_CLOSE.byteLength; i >= 0; i--) {
    for (let j = 0; j < BODY_CLOSE.byteLength; j++) {
      if (bytes[i + j] !== BODY_CLOSE[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** Whether "<body" occurs in `bytes` before index `end`. */
function hasBodyOpenBefore(bytes: Uint8Array, end: number): boolean {
  outer: for (let i = 0; i + BODY_OPEN.byteLength <= end; i++) {
    for (let j = 0; j < BODY_OPEN.byteLength; j++) {
      if (bytes[i + j] !== BODY_OPEN[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Largest index <= `end` that starts a UTF-8 character (i.e. is not a
 * continuation byte), so a split at it never severs a multi-byte character.
 */
function utf8SafeBoundary(bytes: Uint8Array, end: number): number {
  let i = end;
  while (i > 0 && (bytes[i] & 0b11000000) === 0b10000000) i--;
  return i;
}

export function interleaveFlightIntoHtmlStream({
  htmlStream,
  flightStream,
  nonce,
}: {
  htmlStream: ReadableStream<Uint8Array>;
  flightStream: ReadableStream<Uint8Array>;
  /** CSP script-src nonce stamped on every injected script. */
  nonce?: string;
}): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // Scripts flush only once the emitted bytes have opened <body> — a
      // script between </head> and <body> (or inside head) would be
      // re-parented by the parser. Forced true once the HTML completes, so a
      // headless fragment (no <body> at all) still gets its scripts appended.
      let bodyOpen = false;
      let failed = false;
      const pendingFlight: string[] = [];

      const fail = (error: unknown) => {
        if (failed) return;
        failed = true;
        controller.error(error);
      };

      const flushFlight = () => {
        if (!bodyOpen || failed) return;
        while (pendingFlight.length > 0) {
          controller.enqueue(chunkScript(pendingFlight.shift()!, nonce));
        }
      };

      // Flight pump runs concurrently with the HTML read loop below; chunks
      // that arrive while HTML is still flowing are injected at the next
      // flush point, chunks after HTML ends are drained before the trailer.
      const flightPump = (async () => {
        const reader = flightStream.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value?.byteLength) {
            pendingFlight.push(bytesToBase64(value));
            flushFlight();
          }
        }
      })().catch(fail);

      try {
        const reader = htmlStream.getReader();
        let tail: Uint8Array = new Uint8Array(0);
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value?.byteLength) continue;
          const merged = concatBytes(tail, value);
          const emitEnd = utf8SafeBoundary(
            merged,
            Math.max(0, merged.byteLength - TRAILER_HOLDBACK)
          );
          if (emitEnd > 0) {
            controller.enqueue(merged.subarray(0, emitEnd));
            // A "<body" spanning the emit boundary is caught next round (its
            // bytes stay in the tail) — the flag just sets one flush late.
            if (!bodyOpen && hasBodyOpenBefore(merged, emitEnd)) {
              bodyOpen = true;
            }
            flushFlight();
          }
          tail = merged.subarray(emitEnd);
        }

        // HTML is complete: split the held-back tail into content + trailer.
        const trailerIdx = lastIndexOfBodyClose(tail);
        const content = trailerIdx === -1 ? tail : tail.subarray(0, trailerIdx);
        const trailer = trailerIdx === -1 ? null : tail.subarray(trailerIdx);
        if (content.byteLength > 0) controller.enqueue(content);
        bodyOpen = true;
        flushFlight();

        // Remaining flight (a slow producer keeps streaming after the HTML
        // finished), then the completion sentinel, then the trailer.
        await flightPump;
        if (failed) return;
        flushFlight();
        controller.enqueue(doneScript(nonce));
        if (trailer) controller.enqueue(trailer);
        controller.close();
      } catch (error) {
        fail(error);
      }
    },
  });
}
