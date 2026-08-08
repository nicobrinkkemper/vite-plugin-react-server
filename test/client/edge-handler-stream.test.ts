import { describe, expect, it } from "vitest";
import * as streamApi from "vite-plugin-react-server/stream";
import { createEdgeRequestHandler } from "vite-plugin-react-server/edge";
import { INLINE_FLIGHT_STREAM_GLOBAL } from "../../plugin/utils/inlineFlightId.js";

// createEdgeHandler is client-only (default condition) — same guard the other
// single-isolate edge tests use; the suite runs on the client leg of test-both.
const createEdgeHandler = (streamApi as { createEdgeHandler?: unknown })
  .createEdgeHandler as
  | typeof import("../../plugin/stream/createEdgeHandler.client.js").createEdgeHandler
  | undefined;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const SHELL = `<html><head></head><body><div id="root">shell</div>`;
const TRAILER = `</body></html>`;

function timedStream(
  parts: Array<{ text: string; afterMs: number }>,
  onDone?: () => void,
  onChunk?: (index: number, at: number) => void
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const t0 = Date.now();
      for (let i = 0; i < parts.length; i++) {
        const { text, afterMs } = parts[i];
        const wait = t0 + afterMs - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        onChunk?.(i, Date.now());
        controller.enqueue(encoder.encode(text));
      }
      onDone?.();
      controller.close();
    },
  });
}

// The handler's renderFlightToHtml contract: ignore the flight input and
// produce a timed HTML document (the fake stands in for react-dom).
function fakeRenderer(parts: Array<{ text: string; afterMs: number }>) {
  return (async () =>
    timedStream(parts)) as unknown as NonNullable<
    Parameters<NonNullable<typeof createEdgeHandler>>[0]["renderFlightToHtml"]
  >;
}

describe.skipIf(!createEdgeHandler)("createEdgeHandler inlineFlight modes", () => {
  it('"stream": shell TTFB before the next HTML chunk; flight interleaves; trailer last', async () => {
    let headlessDoneAt = 0;
    let shellProducedAt = 0;
    let secondHtmlProducedAt = 0;
    const handler = createEdgeHandler!({
      renderDocument: async () => ({
        full: timedStream([{ text: "full-flight", afterMs: 0 }]),
        // Headless flight finishes LATE — long after the HTML shell.
        headless: timedStream(
          [
            { text: "chunk-one", afterMs: 30 },
            { text: "chunk-two", afterMs: 120 },
          ],
          () => {
            headlessDoneAt = Date.now();
          }
        ),
      }),
      // 30 bytes of late HTML + trailer — under the old 32-byte whole-chunk
      // holdback this pinned the shell until the HTML stream completed,
      // defeating TTFB = shell flush. The response must become readable
      // before this second producer chunk is even produced.
      renderFlightToHtml: (async () =>
        timedStream(
          [
            { text: SHELL, afterMs: 0 },
            { text: `<p>late html</p>${TRAILER}`, afterMs: 60 },
          ],
          undefined,
          (index, at) => {
            if (index === 0) shellProducedAt = at;
            if (index === 1) secondHtmlProducedAt = at;
          }
        )) as unknown as NonNullable<
        Parameters<NonNullable<typeof createEdgeHandler>>[0]["renderFlightToHtml"]
      >,
      inlineFlight: "stream",
    });

    const res = await handler(new Request("http://edge.test/page/"));
    expect(res.headers.get("content-type")).toContain("text/html");

    const reader = res.body!.getReader();
    const first = await reader.read();
    const firstAt = Date.now();
    expect(first.done).toBe(false);
    const firstText = decoder.decode(first.value);
    // The shell flushed on its own — before the second HTML chunk AND before
    // the headless flight completed. (Asserting only vs. flight-done at 120ms
    // used to pass while the shell was still stuck behind a 32-byte holdback
    // waiting for the 60ms late chunk.)
    expect(firstText.startsWith("<html>")).toBe(true);
    expect(shellProducedAt).toBeGreaterThan(0);
    expect(secondHtmlProducedAt === 0 || firstAt < secondHtmlProducedAt).toBe(
      true
    );
    expect(headlessDoneAt === 0 || firstAt < headlessDoneAt).toBe(true);

    let rest = firstText;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += decoder.decode(value, { stream: true });
    }
    // Both chunks + the sentinel, in order, inside the document.
    const pushes = [
      ...rest.matchAll(
        new RegExp(
          `\\(self\\.${INLINE_FLIGHT_STREAM_GLOBAL}\\|\\|=\\[\\]\\)\\.push\\((?:"([^"]*)"|null)\\)`,
          "g"
        )
      ),
    ].map((m) => (m[1] === undefined ? null : atob(m[1])));
    expect(pushes).toEqual(["chunk-one", "chunk-two", null]);
    expect(rest.endsWith(TRAILER)).toBe(true);
    // No blob element in streamed mode.
    expect(rest.includes('id="vprs-flight"')).toBe(false);
  });

  it('"stream" + nonce: every injected script carries it', async () => {
    const handler = createEdgeHandler!({
      renderDocument: async () => ({
        full: timedStream([{ text: "f", afterMs: 0 }]),
        headless: timedStream([{ text: "x", afterMs: 5 }]),
      }),
      renderFlightToHtml: fakeRenderer([
        { text: SHELL, afterMs: 0 },
        { text: TRAILER, afterMs: 20 },
      ]),
      inlineFlight: "stream",
      nonce: "abc123=",
    });
    const html = await (await handler(new Request("http://edge.test/"))).text();
    const opens = html.match(/<script[^>]*>/g) ?? [];
    expect(opens.length).toBeGreaterThan(0);
    for (const open of opens) expect(open).toBe(`<script nonce="abc123=">`);
  });

  it('default ("blob") keeps the buffered splice: one inert payload element, no push scripts', async () => {
    const handler = createEdgeHandler!({
      renderDocument: async () => ({
        full: timedStream([{ text: "f", afterMs: 0 }]),
        headless: timedStream([{ text: "payload", afterMs: 10 }]),
      }),
      renderFlightToHtml: fakeRenderer([
        { text: SHELL, afterMs: 0 },
        { text: TRAILER, afterMs: 20 },
      ]),
    });
    const html = await (await handler(new Request("http://edge.test/"))).text();
    expect(html.includes('id="vprs-flight"')).toBe(true);
    expect(html.includes(INLINE_FLIGHT_STREAM_GLOBAL)).toBe(false);
    // The splice inserts the payload element BEFORE </body>, keeping the
    // trailer at the very end.
    expect(html.endsWith(TRAILER)).toBe(true);
    expect(html.indexOf('id="vprs-flight"')).toBeGreaterThan(
      html.indexOf("shell")
    );
    expect(html.indexOf('id="vprs-flight"')).toBeLessThan(
      html.lastIndexOf(TRAILER)
    );
  });
});

// The CONFIG path: `build.inlineFlight: "stream"` reaches the handler through
// the bake's `inlineFlight` export, forwarded by createEdgeRequestHandler —
// the consumer never re-states the mode. The bake-side half (the export
// existing and carrying the resolved value) is asserted in the example build
// tests; this proves the forwarding half with a fake bundle.
describe.skipIf(!createEdgeHandler)("createEdgeRequestHandler inlineFlight forwarding", () => {
  const fakeBundle = (inlineFlight?: false | "blob" | "stream") =>
    ({
      renderRouteToDocument: async () => ({
        full: timedStream([{ text: "f", afterMs: 0 }]),
        headless: timedStream([{ text: "payload", afterMs: 10 }]),
      }),
      ...(inlineFlight !== undefined ? { inlineFlight } : {}),
    }) as never;

  const renderFlightToHtml = fakeRenderer([
    { text: SHELL, afterMs: 0 },
    { text: TRAILER, afterMs: 20 },
  ]);

  it('bundle inlineFlight: "stream" streams the document with NO handler-side option', async () => {
    const handler = createEdgeRequestHandler(fakeBundle("stream"), {
      renderFlightToHtml,
    });
    const html = await (
      await handler(new Request("http://edge.test/page/"))
    ).text();
    expect(html.includes(INLINE_FLIGHT_STREAM_GLOBAL)).toBe(true);
    expect(html.includes('id="vprs-flight"')).toBe(false);
  });

  it("an explicit handler option beats the baked mode", async () => {
    const handler = createEdgeRequestHandler(fakeBundle("stream"), {
      renderFlightToHtml,
      inlineFlight: "blob",
    });
    const html = await (
      await handler(new Request("http://edge.test/page/"))
    ).text();
    expect(html.includes('id="vprs-flight"')).toBe(true);
    expect(html.includes(INLINE_FLIGHT_STREAM_GLOBAL)).toBe(false);
  });

  it("a pre-mode bundle (no inlineFlight export) keeps the blob default", async () => {
    const handler = createEdgeRequestHandler(fakeBundle(undefined), {
      renderFlightToHtml,
    });
    const html = await (
      await handler(new Request("http://edge.test/page/"))
    ).text();
    expect(html.includes('id="vprs-flight"')).toBe(true);
    expect(html.includes(INLINE_FLIGHT_STREAM_GLOBAL)).toBe(false);
  });
});
