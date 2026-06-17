/**
 * Characterization tests for collectRscContent / collectHtmlContent.
 *
 * These two helpers are ~95% identical and are slated to be consolidated into a
 * single `collectStreamContent` helper. They are part of the public
 * `./react-static` subpath but have no internal callers and (until now) no
 * tests, so this file pins their CURRENT observable behavior first.
 *
 * Two quirks this locks in (both worth fixing during consolidation, not
 * preserving blindly):
 *  - The returned `pipe` wrapper is single-use; real reuse is via
 *    `bufferedContent` (the "can be piped multiple times" comment is wishful).
 *  - Completion is TIMEOUT-bound, not stream-bound: the internal `consumer`
 *    PassThrough is never drained, so the `"end"` event never fires and each
 *    call resolves only when its timeout elapses (rscTimeout for RSC, a
 *    hard-coded 15s for HTML). The metrics are still captured correctly because
 *    the Transform counts chunks as they flow. Tests therefore use a short
 *    rscTimeout; the single HTML test pays the fixed 15s once on purpose.
 *
 * If the consolidation changes any of these expectations, that is a deliberate
 * decision to make in review — not a silent regression.
 */
import { describe, it, expect, vi } from "vitest";
import { PassThrough, Writable } from "node:stream";
import { createLogger } from "vite";
import { collectRscContent } from "../../plugin/react-static/collectRscContent.js";
import { collectHtmlContent } from "../../plugin/react-static/collectHtmlContent.js";

type Source = PassThrough & { abort: ReturnType<typeof vi.fn> };

/** A pre-filled source stream that also satisfies the `.abort()` contract. */
function makeSource(chunks: Buffer[], { end = true } = {}): Source {
  const pt = new PassThrough() as Source;
  // No-arg destroy avoids emitting an "error" event with a truthy reason.
  pt.abort = vi.fn((reason?: unknown) => pt.destroy(reason as Error));
  for (const c of chunks) pt.write(c);
  if (end) pt.end();
  return pt;
}

const baseOptions = (over: Record<string, unknown> = {}) =>
  ({
    verbose: false,
    logger: createLogger("silent"),
    route: "/",
    rscTimeout: 200,
    ...over,
  }) as any;

/** Drain a wrapper's `pipe()` into a single Buffer. */
async function drain(wrapper: {
  pipe: (dest: Writable) => Writable;
}): Promise<Buffer> {
  const out: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      out.push(Buffer.from(chunk));
      cb();
    },
  });
  await new Promise<void>((resolve, reject) => {
    sink.on("finish", resolve);
    sink.on("error", reject);
    wrapper.pipe(sink);
  });
  return Buffer.concat(out);
}

describe("collectRscContent", () => {
  const chunks = [Buffer.from("hello "), Buffer.from("rsc "), Buffer.from("world")];
  const expected = Buffer.concat(chunks);

  it("tracks chunk and byte metrics for the consumed stream", async () => {
    const result = await collectRscContent(makeSource(chunks), baseOptions());
    expect(result.metrics.chunks).toBe(chunks.length);
    expect(result.metrics.bytes).toBe(expected.length);
    expect(typeof result.metrics.duration).toBe("number");
    expect(result.metrics.duration).toBeGreaterThanOrEqual(0);
  });

  it("exposes the full content as bufferedContent (the reuse mechanism)", async () => {
    const result = await collectRscContent(makeSource(chunks), baseOptions());
    expect(Array.isArray(result.bufferedContent)).toBe(true);
    expect(Buffer.concat(result.bufferedContent!)).toEqual(expected);
  });

  it("pipes the collected content through once", async () => {
    const result = await collectRscContent(makeSource(chunks), baseOptions());
    expect(await drain(result)).toEqual(expected);
  });

  it("resolves via rscTimeout when the source never ends", async () => {
    const result = await collectRscContent(
      makeSource([Buffer.from("partial")], { end: false }),
      baseOptions({ rscTimeout: 50 })
    );
    // Timed out rather than hung; the one delivered chunk is still buffered.
    expect(result.metrics.bytes).toBe("partial".length);
  });

  it("propagates abort to the source stream", async () => {
    const source = makeSource(chunks);
    const result = await collectRscContent(source, baseOptions());
    result.abort();
    expect(source.abort).toHaveBeenCalledTimes(1);
  });
});

describe("collectHtmlContent", () => {
  // One test pays the hard-coded 15s completion timeout once and asserts the
  // full contract (metrics + single pipe + abort propagation) together.
  it("collects metrics, pipes content once, and propagates abort", async () => {
    const chunks = [Buffer.from("<html>"), Buffer.from("<body/>"), Buffer.from("</html>")];
    const expected = Buffer.concat(chunks);
    const source = makeSource(chunks);

    const result = await collectHtmlContent(source, baseOptions());

    expect(result.metrics.chunks).toBe(chunks.length);
    expect(result.metrics.bytes).toBe(expected.length);
    expect(await drain(result)).toEqual(expected);

    result.abort();
    expect(source.abort).toHaveBeenCalledTimes(1);
  });
});
