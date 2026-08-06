/**
 * Browser-side reader for the STREAMED inline-flight protocol
 * (`inlineFlight: "stream"`): the server interleaves the flight into the HTML
 * as `<script>(self.__vprsFlightChunks||=[]).push("<base64>")</script>`
 * chunks closed by a `push(null)` sentinel (see interleaveFlightIntoHtml).
 * This module turns that global array back into a `ReadableStream<Uint8Array>`
 * for the flight decoder: drain whatever already executed, then replace the
 * array's `push` so chunks that arrive while the document is still parsing
 * flow straight through.
 *
 * Mirrors takeInlineFlight's contract: claim-once, never throws from the take
 * itself, `null` means "no streamed payload" and the caller falls back to
 * fetching `index.rsc`. The one difference: a payload that went bad AFTER
 * claiming (corrupt base64 mid-stream) errors the RETURNED stream — by then
 * bytes may already be consumed, so a silent network restart is not possible;
 * the decode failure surfaces to the caller's error path instead.
 *
 * The parser race (a cached client entry running before any chunk script has
 * executed) is handled like the blob's short-read: if the global is absent
 * while the document is still loading, wait for `DOMContentLoaded` — by then
 * every inline script has run — and re-check. A document with no streamed
 * payload resolves `null` and costs one event listener.
 */
import { INLINE_FLIGHT_STREAM_GLOBAL } from "./inlineFlightId.js";

type FlightChunkArray = Array<string | null>;

let streamedFlightConsumed = false;

function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function currentChunkArray(): FlightChunkArray | null {
  const value = (globalThis as Record<string, unknown>)[
    INLINE_FLIGHT_STREAM_GLOBAL
  ];
  return Array.isArray(value) ? (value as FlightChunkArray) : null;
}

function adoptChunkArray(arr: FlightChunkArray): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let settled = false;
      const feed = (item: string | null) => {
        if (settled) return; // anything after the sentinel (or an error) is noise
        if (item === null) {
          settled = true;
          controller.close();
          return;
        }
        try {
          controller.enqueue(base64ToBytes(item));
        } catch (error) {
          settled = true;
          controller.error(
            error instanceof Error ? error : new Error(String(error))
          );
        }
      };
      for (const item of arr) feed(item);
      // Late chunks: the interleaved scripts keep calling push on THIS array
      // (the global stays set, so `(self.X ||= [])` resolves to it). Replace
      // push so they stream through instead of piling up unread.
      arr.push = (...items: Array<string | null>) => {
        for (const item of items) feed(item);
        return arr.length;
      };
    },
  });
}

/**
 * Take the streamed flight, if this document delivers one.
 *
 * Synchronous `ReadableStream` when chunk scripts have already executed; a
 * promise when the document is still parsing and the answer isn't knowable
 * yet; `null` when there is no streamed payload (fetch `index.rsc` as usual).
 */
export function takeStreamedFlight():
  | ReadableStream<Uint8Array>
  | PromiseLike<ReadableStream<Uint8Array> | null>
  | null {
  if (streamedFlightConsumed) return null;

  const arr = currentChunkArray();
  if (arr) {
    streamedFlightConsumed = true;
    return adoptChunkArray(arr);
  }

  // No chunk script has executed yet. If the parser is still running the
  // payload may simply not have arrived — re-check once it has seen the
  // whole document.
  if (typeof document === "undefined" || document.readyState !== "loading") {
    return null;
  }
  return new Promise<ReadableStream<Uint8Array> | null>((resolve) => {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        const late = currentChunkArray();
        if (!late || streamedFlightConsumed) return resolve(null);
        streamedFlightConsumed = true;
        resolve(adoptChunkArray(late));
      },
      { once: true }
    );
  });
}
