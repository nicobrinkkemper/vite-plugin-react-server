/**
 * Interleave a flight payload into an HTML stream as it renders — the
 * `inlineFlight: "stream"` delivery shape. Where the "blob" shape buffers the
 * whole document and splices one non-executable script before `</body>`, this
 * transform passes HTML through as it arrives and injects each flight chunk as
 * an executable `<script>(self.__vprsFlightChunks||=[]).push("<base64>")
 * </script>` at the next splice point, closing with a `push(null)` sentinel.
 * TTFB is the shell flush, the server never holds the whole document or
 * payload, and Suspense reveals progressively. (Not fully backpressured:
 * a consumer slower than the producers queues chunks in the stream
 * controller — see the contract limits below.)
 *
 * Web-standard by construction (ReadableStream + TextEncoder only, no node:*):
 * this must run on workerd/Deno/Vercel Edge as-is.
 *
 * Ordering guarantees:
 *  - a script is written only at a SPLICE POINT: directly after a tag end,
 *    as a direct child of `<body>` (htmlSpliceCursor). Producer chunk
 *    boundaries are not trusted: React's streaming renderer packs its output
 *    into fixed-size views (4096 bytes on the edge build) and a view ends on
 *    an arbitrary byte, an attribute value included. A script written there
 *    is attribute text, never an element, and its payload is lost; a script
 *    written between tags inside the hydrated tree does run, but hydration
 *    then meets an element the server never rendered. A flight chunk pending
 *    while HTML flows goes in at the first splice point from the boundary it
 *    arrived on, which may be inside a producer chunk (the chunk is then
 *    written in two pieces around it); a chunk without one passes through
 *    whole and the flight waits;
 *  - no flight script is emitted until the `<body>` start tag has been
 *    written (a headless fragment without one gets its scripts appended at
 *    the end);
 *  - flight chunks are emitted in flight order;
 *  - the document's closing `</body></html>` trailer is held back (whole
 *    chunks from the first `</body>` evidence onward) and re-emitted after
 *    the last flight script, so every script parses inside `<body>`. Chunks
 *    before that evidence — including the shell — emit immediately; a fixed
 *    byte holdback would otherwise pin the shell until a later chunk large
 *    enough to cover the window arrived, defeating TTFB = shell flush.
 *
 * Contract limits (trailer matching is structure-blind by design):
 *  - a literal `</body>` mid-document (a comment, a code sample) starts the
 *    trailer hold early: the remaining HTML waits until the stream ends and
 *    the scripts land before the last `</body>` — delayed, still parsed and
 *    executed;
 *  - bytes appended after `</html>` by an upstream transform scroll the real
 *    trailer out of reach and scripts append at the very end instead;
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
import { createHtmlSpliceCursor } from "./htmlSpliceCursor.js";

const encoder = new TextEncoder();

const BODY_CLOSE = new Uint8Array([0x3c, 0x2f, 0x62, 0x6f, 0x64, 0x79, 0x3e]); // "</body>"

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

/**
 * Longest suffix of `bytes` that is a proper prefix of `</body>`. Non-zero
 * means the next chunk might complete a close tag that started here — hold
 * this chunk rather than emit it (whole-chunk contract).
 */
function bodyClosePrefixLength(bytes: Uint8Array): number {
  const max = Math.min(bytes.byteLength, BODY_CLOSE.byteLength - 1);
  outer: for (let len = max; len > 0; len--) {
    for (let j = 0; j < len; j++) {
      if (bytes[bytes.byteLength - len + j] !== BODY_CLOSE[j]) continue outer;
    }
    return len;
  }
  return 0;
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
      // Where the emitted HTML stands: scripts go in only where the cursor
      // says a direct child of <body> can start. Once the HTML is complete
      // the remaining flight is written before the trailer regardless, so a
      // headless fragment (no <body> at all) still gets its scripts appended.
      const cursor = createHtmlSpliceCursor();
      let htmlDone = false;
      let failed = false;
      const pendingFlight: string[] = [];

      const fail = (error: unknown) => {
        if (failed) return;
        failed = true;
        controller.error(error);
      };

      const writeFlight = () => {
        while (pendingFlight.length > 0) {
          controller.enqueue(chunkScript(pendingFlight.shift()!, nonce));
        }
      };

      /** Write the pending flight here, if a script can start here. */
      const flushFlight = () => {
        if (failed) return;
        if (htmlDone || cursor.canSplice()) writeFlight();
      };

      // Flight pump runs concurrently with the HTML read loop below; chunks
      // that arrive while HTML is still flowing are injected at the next
      // splice point, chunks after HTML ends are drained before the trailer.
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
        // Trailer holdback is evidence-gated, not a fixed byte window: emit
        // every chunk immediately until `</body>` appears, then hold from
        // that chunk onward. A chunk that merely ENDS on a proper prefix of
        // it (`<`, `</`, `</b`…) is held only until the next chunk settles
        // it: completed, the hold is confirmed; not completed, the held
        // chunks are released and the HTML keeps flowing. React's fixed-size
        // views end on arbitrary bytes, so any tag can split there — a hold
        // that never re-checked kept the shell and everything after a split
        // `<section>` buffered until the HTML finished. A fixed N-byte window
        // refused to release the shell whenever the next producer chunk was
        // smaller than N — TTFB collapsed to "HTML finished" for the common
        // small-trailer case.
        const held: Uint8Array[] = [];
        let trailerConfirmed = false;
        // Pass an HTML chunk through. Flight pending at this boundary goes
        // in here when the boundary is a splice point, else at the first
        // splice point inside the chunk, else it waits for a later chunk.
        const emit = (chunk: Uint8Array) => {
          if (pendingFlight.length > 0 && !failed && !cursor.canSplice()) {
            const at = cursor.scan(chunk);
            if (at === -1) {
              controller.enqueue(chunk);
              return;
            }
            controller.enqueue(chunk.subarray(0, at));
            writeFlight();
            if (at < chunk.byteLength) controller.enqueue(chunk.subarray(at));
            return;
          }
          flushFlight();
          cursor.scan(chunk);
          controller.enqueue(chunk);
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value?.byteLength) continue;
          held.push(value);
          if (trailerConfirmed) continue;
          // The held chunks are at most a few bytes of a possible close tag
          // plus this chunk; every chunk released before them ended on no
          // prefix of `</body>`, so a close tag cannot start in released
          // bytes and the window is all that needs scanning.
          let window: Uint8Array = new Uint8Array(0);
          for (const chunk of held) window = concatBytes(window, chunk);
          if (lastIndexOfBodyClose(window) !== -1) {
            // First evidence of the trailer: hold from here on. Shell / body
            // content before this point has already been emitted.
            trailerConfirmed = true;
            continue;
          }
          // Release, in order, every whole chunk that ends before the prefix
          // region (whole-chunk contract); what overlaps it stays held.
          const keep = window.byteLength - bodyClosePrefixLength(window);
          let end = 0;
          while (held.length > 0 && end + held[0].byteLength <= keep) {
            const chunk = held.shift()!;
            end += chunk.byteLength;
            emit(chunk);
          }
        }

        // HTML is complete: split the held window into content + trailer.
        // The split point is the last "</body>" — a tag boundary, so the
        // final injection position is exactly where the blob splice goes.
        // The content goes out whole, flight after it: the HTML is finished,
        // so an earlier splice point inside it would buy nothing.
        let tail: Uint8Array = new Uint8Array(0);
        for (const chunk of held) tail = concatBytes(tail, chunk);
        const trailerIdx = lastIndexOfBodyClose(tail);
        const content = trailerIdx === -1 ? tail : tail.subarray(0, trailerIdx);
        const trailer = trailerIdx === -1 ? null : tail.subarray(trailerIdx);
        if (content.byteLength > 0) {
          cursor.scan(content);
          controller.enqueue(content);
        }
        htmlDone = true;
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
