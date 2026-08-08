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
 *  - HTML chunks pass through WHOLE: a script is only injected BETWEEN two
 *    producer chunks (or at the final `</body>` boundary) — never inside one.
 *    PRODUCER CONTRACT: chunk boundaries must not split an HTML token;
 *    React's renderer flushes at element boundaries and satisfies this. A
 *    producer that splits tags across chunks (e.g. byte-sized rechunking)
 *    voids the placement guarantee;
 *  - no flight script is emitted until the `<body` open tag has been emitted
 *    (a headless fragment without one gets its scripts appended at the end);
 *  - flight chunks are emitted in flight order;
 *  - the document's closing `</body></html>` trailer is held back (whole
 *    chunks from the first `</body>` evidence onward) and re-emitted after
 *    the last flight script, so every script parses inside `<body>`. Chunks
 *    before that evidence — including the shell — emit immediately; a fixed
 *    byte holdback would otherwise pin the shell until a later chunk large
 *    enough to cover the window arrived, defeating TTFB = shell flush.
 *
 * Contract limits (byte matching is structure-blind by design):
 *  - a literal `<body` in head-side content (a comment, a code sample) opens
 *    the flight gate early, and a literal `</body>` mid-document starts the
 *    trailer hold early (remaining HTML waits until the stream ends; scripts
 *    still land before the last `</body>`) — such documents get their
 *    scripts delayed or mis-placed (they still parse and execute);
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

const encoder = new TextEncoder();

const BODY_CLOSE = new Uint8Array([0x3c, 0x2f, 0x62, 0x6f, 0x64, 0x79, 0x3e]); // "</body>"
const BODY_OPEN = new Uint8Array([0x3c, 0x62, 0x6f, 0x64, 0x79]); // "<body"

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

/** Whether "<body" occurs anywhere in `bytes`. */
function hasBodyOpen(bytes: Uint8Array): boolean {
  outer: for (let i = 0; i + BODY_OPEN.byteLength <= bytes.byteLength; i++) {
    for (let j = 0; j < BODY_OPEN.byteLength; j++) {
      if (bytes[i + j] !== BODY_OPEN[j]) continue outer;
    }
    return true;
  }
  return false;
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

/** True when `bytes` contain `</body>` or end on a proper prefix of it. */
function mayBeTrailer(bytes: Uint8Array): boolean {
  return lastIndexOfBodyClose(bytes) !== -1 || bodyClosePrefixLength(bytes) > 0;
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
        // HTML chunks pass through WHOLE, in order — a script is only ever
        // injected BETWEEN two producer chunks (or before the trailer), never
        // inside one. React's renderer flushes at element boundaries, so a
        // between-chunks position can't land inside a tag, attribute, or
        // text run. (Slicing chunks to hold back the trailer — the previous
        // design — put splice points at arbitrary byte offsets and mangled
        // markup: a flight script once landed inside a bootstrap script's
        // src attribute.)
        //
        // Trailer holdback is evidence-gated, not a fixed byte window: emit
        // every chunk immediately until `</body>` (or a proper prefix of it
        // at a chunk boundary) appears, then hold from that chunk onward.
        // A fixed N-byte window refused to release the shell whenever the
        // next producer chunk was smaller than N — TTFB collapsed to "HTML
        // finished" for the common small-trailer case.
        const held: Uint8Array[] = [];
        let holdingTrailer = false;
        // "<body" / "</body>" detection runs with a small overlap carry so a
        // tag split across chunks is still seen.
        let openCarry: Uint8Array = new Uint8Array(0);
        let closeCarry: Uint8Array = new Uint8Array(0);
        const emitWhole = (chunk: Uint8Array) => {
          if (bodyOpen) flushFlight(); // between-chunks injection point
          controller.enqueue(chunk);
          if (!bodyOpen) {
            const scan = concatBytes(openCarry, chunk);
            if (hasBodyOpen(scan)) {
              // The chunk that opens <body> is the first safe flush point —
              // drain any flight that arrived during head/shell production
              // now, not on a later HTML chunk or finalization.
              bodyOpen = true;
              flushFlight();
            }
            openCarry = scan.subarray(
              Math.max(0, scan.byteLength - (BODY_OPEN.byteLength - 1))
            );
          }
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value?.byteLength) continue;
          if (holdingTrailer) {
            held.push(value);
            continue;
          }
          const closeScan = concatBytes(closeCarry, value);
          if (mayBeTrailer(closeScan)) {
            // First evidence of the trailer (or a split close tag): hold
            // this chunk and everything after. Shell / body content before
            // this point has already been emitted.
            holdingTrailer = true;
            held.push(value);
            continue;
          }
          emitWhole(value);
          closeCarry = closeScan.subarray(
            Math.max(0, closeScan.byteLength - (BODY_CLOSE.byteLength - 1))
          );
        }

        // HTML is complete: split the held window into content + trailer.
        // The split point is the last "</body>" — a tag boundary, so the
        // final injection position is exactly where the blob splice goes.
        let tail: Uint8Array = new Uint8Array(0);
        for (const chunk of held) tail = concatBytes(tail, chunk);
        const trailerIdx = lastIndexOfBodyClose(tail);
        const content = trailerIdx === -1 ? tail : tail.subarray(0, trailerIdx);
        const trailer = trailerIdx === -1 ? null : tail.subarray(trailerIdx);
        if (content.byteLength > 0) {
          if (bodyOpen) flushFlight();
          controller.enqueue(content);
        }
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
