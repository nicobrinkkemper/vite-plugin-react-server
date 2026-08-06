import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INLINE_FLIGHT_STREAM_GLOBAL } from "../../plugin/utils/inlineFlightId.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const G = globalThis as Record<string, unknown>;

// The reader claims once per module instance; reset the module registry so
// each test's import re-evaluates with an unclaimed flag (module state by
// design, mirroring takeInlineFlight).
beforeEach(() => {
  vi.resetModules();
});

async function freshTake() {
  const mod = await import("../../plugin/utils/streamedFlight.js");
  return mod.takeStreamedFlight;
}

function pushChunk(text: string | null) {
  const arr = (G[INLINE_FLIGHT_STREAM_GLOBAL] ??= []) as Array<string | null>;
  arr.push(text === null ? null : btoa(text));
}

async function collectText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    if (value) out += decoder.decode(value, { stream: true });
  }
}

afterEach(() => {
  delete G[INLINE_FLIGHT_STREAM_GLOBAL];
});

describe("takeStreamedFlight", () => {
  it("returns null when no chunk script has executed (and no document to wait on)", async () => {
    const take = await freshTake();
    expect(take()).toBeNull();
  });

  it("drains the backlog and closes on the sentinel", async () => {
    pushChunk("hello ");
    pushChunk("world");
    pushChunk(null);
    const take = await freshTake();
    const stream = take();
    expect(stream).not.toBeNull();
    expect(stream && "getReader" in stream).toBe(true);
    await expect(
      collectText(stream as ReadableStream<Uint8Array>)
    ).resolves.toBe("hello world");
  });

  it("streams chunks that arrive AFTER the reader claimed the array", async () => {
    pushChunk("early ");
    const take = await freshTake();
    const stream = take() as ReadableStream<Uint8Array>;
    const collected = collectText(stream);
    // Late scripts call push on the same global array.
    pushChunk("late");
    pushChunk(null);
    await expect(collected).resolves.toBe("early late");
  });

  it("claims once: a second take returns null", async () => {
    pushChunk("x");
    pushChunk(null);
    const take = await freshTake();
    expect(take()).not.toBeNull();
    expect(take()).toBeNull();
  });

  it("ignores pushes after the sentinel", async () => {
    pushChunk("a");
    pushChunk(null);
    const take = await freshTake();
    const stream = take() as ReadableStream<Uint8Array>;
    pushChunk("ghost");
    await expect(collectText(stream)).resolves.toBe("a");
  });

  it("errors the stream on corrupt base64 instead of throwing from take", async () => {
    const arr = (G[INLINE_FLIGHT_STREAM_GLOBAL] ??= []) as Array<string | null>;
    arr.push("%%not-base64%%");
    const take = await freshTake();
    const stream = take() as ReadableStream<Uint8Array>;
    await expect(collectText(stream)).rejects.toThrow();
  });

  it("round-trips binary bytes exactly", async () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const arr = (G[INLINE_FLIGHT_STREAM_GLOBAL] ??= []) as Array<string | null>;
    arr.push(btoa(binary));
    arr.push(null);
    const take = await freshTake();
    const stream = take() as ReadableStream<Uint8Array>;
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const merged = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    expect([...merged]).toEqual([...bytes]);
  });

  it("a non-array global is treated as absent", async () => {
    G[INLINE_FLIGHT_STREAM_GLOBAL] = "not an array";
    const take = await freshTake();
    expect(take()).toBeNull();
  });

  it("reader output matches what the interleave transform emits (contract round-trip)", async () => {
    // Simulate the wire: what interleaveFlightIntoHtml's scripts would push
    // is exactly base64-of-flight-bytes, in order, then null.
    const flight = ['0:["$","div",null,{}]\n', "1:I[123]\n"];
    for (const f of flight) {
      const arr = (G[INLINE_FLIGHT_STREAM_GLOBAL] ??= []) as Array<
        string | null
      >;
      let binary = "";
      for (const b of encoder.encode(f)) binary += String.fromCharCode(b);
      arr.push(btoa(binary));
    }
    pushChunk(null);
    const take = await freshTake();
    const stream = take() as ReadableStream<Uint8Array>;
    await expect(collectText(stream)).resolves.toBe(flight.join(""));
  });
});
