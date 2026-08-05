/**
 * Interleave a flight payload into an HTML stream as it renders — the
 * `inlineFlight: "stream"` delivery shape. Where the "blob" shape buffers the
 * whole document and splices one non-executable script before `</body>`, this
 * transform passes HTML through as it arrives and injects each flight chunk as
 * an executable `<script>(self.__vprsFlightChunks||=[]).push("<base64>")
 * </script>` at the next safe point, closing with a `push(null)` sentinel.
 * TTFB is the shell flush, memory stays bounded, and Suspense reveals
 * progressively.
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
 */
import { bytesToBase64 } from "../utils/inlineFlight.js";
import { INLINE_FLIGHT_STREAM_GLOBAL } from "../utils/inlineFlightId.js";

const encoder = new TextEncoder();

const BODY_CLOSE = new Uint8Array([0x3c, 0x2f, 0x62, 0x6f, 0x64, 0x79, 0x3e]); // "</body>"
const BODY_OPEN = new Uint8Array([0x3c, 0x62, 0x6f, 0x64, 0x79]); // "<body"

// Enough to hold "</body></html>" plus stray trailing whitespace.
const TRAILER_HOLDBACK = 32;

function chunkScript(base64: string): Uint8Array {
  return encoder.encode(
    `<script>(self.${INLINE_FLIGHT_STREAM_GLOBAL}||=[]).push("${base64}")</script>`
  );
}

function doneScript(): Uint8Array {
  return encoder.encode(
    `<script>(self.${INLINE_FLIGHT_STREAM_GLOBAL}||=[]).push(null)</script>`
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
}: {
  htmlStream: ReadableStream<Uint8Array>;
  flightStream: ReadableStream<Uint8Array>;
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
          controller.enqueue(chunkScript(pendingFlight.shift()!));
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
        controller.enqueue(doneScript());
        if (trailer) controller.enqueue(trailer);
        controller.close();
      } catch (error) {
        fail(error);
      }
    },
  });
}
