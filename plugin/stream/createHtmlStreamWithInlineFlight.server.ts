/**
 * createHtmlStreamWithInlineFlight.server.ts
 *
 * Per-request (dynamic SSR) counterpart to the build-time inlineFlightPayload.
 *
 * Like createHtmlStream, but embeds the matching headless flight payload into
 * the streamed HTML as a non-executable <script id="vprs-flight">, so a client
 * hydrates the SSR'd markup in place with no index.rsc round-trip (the browser
 * createReactFetcher consumes the inline payload on its first call — see
 * takeInlineFlight). This is what lets a dynamic route — one whose HTML is
 * rendered per request with live data, not prerendered at build time — get the
 * same flash-free first render the static build gets.
 *
 * Two flights, as in the static build (renderPage.server.ts):
 *  - `rscStream`   = the FULL (Html/Root-wrapped) flight, rendered to the HTML
 *                    document.
 *  - `inlineFlight`= the HEADLESS flight (page content only) embedded for the
 *                    client to render into #root.
 * Render both from the SAME live data so the markup and the inline payload agree
 * (otherwise hydration mismatches).
 *
 * v1 buffers the HTML so it can splice the script before </body> once the flight
 * bytes are known — dynamic SSR pages are small. Chunk-streaming the injection
 * (tail-buffered </body> scan) is a follow-up.
 */
import { Transform, type Readable } from "node:stream";
import { createHtmlStream } from "./createHtmlStream.server.js";
import { injectInlineFlightIntoHtml } from "../utils/inlineFlight.js";
import type { CreateHtmlStreamOptions } from "./createHtmlStream.types.js";

/** The headless flight to inline: raw bytes, a promise of them, or a stream. */
export type InlineFlightInput = Uint8Array | Promise<Uint8Array> | Readable;

export type CreateHtmlStreamWithInlineFlightOptions = CreateHtmlStreamOptions & {
  /**
   * The HEADLESS flight payload (page content only — what the client decodes and
   * renders into #root). Render it separately from the full Html-wrapped flight
   * passed as `rscStream`, from the same live data.
   */
  inlineFlight: InlineFlightInput;
};

async function toBytes(input: InlineFlightInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (typeof (input as Promise<Uint8Array>)?.then === "function") {
    return toBytes(await (input as Promise<Uint8Array>));
  }
  const chunks: Buffer[] = [];
  for await (const chunk of input as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export function createHtmlStreamWithInlineFlight(
  options: CreateHtmlStreamWithInlineFlightOptions
): {
  pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => Writable;
  abort: (reason?: unknown) => void;
} {
  const { inlineFlight, ...htmlOptions } = options;
  const html = createHtmlStream(htmlOptions);
  const flightBytes = toBytes(inlineFlight);

  const buffered: Buffer[] = [];
  const inject = new Transform({
    transform(chunk, _encoding, callback) {
      buffered.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
    flush(callback) {
      flightBytes.then(
        (bytes) => {
          this.push(
            injectInlineFlightIntoHtml(
              Buffer.concat(buffered).toString("utf-8"),
              bytes
            )
          );
          callback();
        },
        (error) =>
          callback(error instanceof Error ? error : new Error(String(error)))
      );
    },
  });

  return {
    pipe: <Writable extends NodeJS.WritableStream>(
      destination: Writable
    ): Writable => {
      html.pipe(inject);
      return inject.pipe(destination) as unknown as Writable;
    },
    abort: (reason?: unknown) => {
      html.abort(reason);
      inject.destroy();
    },
  };
}
