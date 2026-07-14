import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * createReactFetcher AbortSignal support.
 *
 * The fetcher must (a) forward the signal to fetch, and (b) keep a
 * deliberately-cancelled stream from surfacing as a render error — the
 * superseded thenable stays pending instead of rejecting, while genuine
 * flight failures still reject.
 */

const ORIGINAL_FETCH = globalThis.fetch;

function flightResponse(body = '0:"ok"\n'): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/x-component" },
  });
}

beforeEach(() => {
  vi.stubGlobal("window", { location: { pathname: "/" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.fetch = ORIGINAL_FETCH;
});

async function importFetcher() {
  const mod = await import("../../plugin/utils/createReactFetcher.js");
  return mod.createReactFetcher;
}

describe("createReactFetcher signal forwarding", () => {
  it("passes the AbortSignal through to fetch", async () => {
    const createReactFetcher = await importFetcher();
    const controller = new AbortController();
    const seen: RequestInit[] = [];
    globalThis.fetch = vi.fn(async (_url: any, init?: RequestInit) => {
      seen.push(init ?? {});
      return flightResponse();
    }) as any;

    createReactFetcher({
      url: "/",
      moduleBaseURL: "/",
      publicOrigin: "http://localhost",
      signal: controller.signal,
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].signal).toBe(controller.signal);
  });

  it("works without a signal (back-compat)", async () => {
    const createReactFetcher = await importFetcher();
    globalThis.fetch = vi.fn(async () => flightResponse()) as any;

    const content = createReactFetcher({
      url: "/",
      moduleBaseURL: "/",
      publicOrigin: "http://localhost",
    });
    await expect(Promise.resolve(content)).resolves.toBeDefined();
  });
});

describe("createReactFetcher cancellation semantics", () => {
  it("an aborted fetch never rejects the returned thenable (stays pending)", async () => {
    const createReactFetcher = await importFetcher();
    const controller = new AbortController();
    globalThis.fetch = vi.fn(
      (_url: any, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(
              new DOMException("The operation was aborted.", "AbortError")
            )
          );
        })
    ) as any;

    const content = createReactFetcher({
      url: "/",
      moduleBaseURL: "/",
      publicOrigin: "http://localhost",
      signal: controller.signal,
    });

    let settled: string | null = null;
    Promise.resolve(content).then(
      () => (settled = "resolved"),
      () => (settled = "rejected")
    );

    controller.abort();
    // give microtasks + a macrotask a chance to deliver any rejection
    await new Promise((r) => setTimeout(r, 20));
    expect(settled).toBe(null);
  });

  it("a genuine flight failure (signal not aborted) still rejects", async () => {
    const createReactFetcher = await importFetcher();
    const controller = new AbortController();
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("network down");
    }) as any;

    const content = createReactFetcher({
      url: "/",
      moduleBaseURL: "/",
      publicOrigin: "http://localhost",
      signal: controller.signal,
    });

    await expect(Promise.resolve(content)).rejects.toThrow("network down");
  });
});

/**
 * Reading the inlined flight payload.
 *
 * The payload is the TEXT of an inline `<script>` near the end of the body, and
 * the client entry is an `async` module — so a cached entry can execute while the
 * parser is still streaming text into that element. Reading `textContent` then
 * yields a TRUNCATED payload, React hits the end of an incomplete flight stream
 * and throws "Connection closed" (#412), and the page never hydrates.
 *
 * These pin the read to a point where the text is guaranteed complete: the
 * fetcher must not touch `textContent` while `readyState === "loading"`.
 */
const PAYLOAD = Buffer.from('0:"ok"\n').toString("base64");

function stubParsingDocument(initial: "loading" | "complete") {
  const listeners: Record<string, Array<() => void>> = {};
  /** readyState captured at each `textContent` access — when the read happened. */
  const readsAt: string[] = [];
  let state = initial;
  /** Mid-parse, the element holds only the bytes seen so far. */
  let text = initial === "loading" ? PAYLOAD.slice(0, 4) : PAYLOAD;

  const el = {
    get textContent() {
      readsAt.push(state);
      return text;
    },
  };

  const document = {
    get readyState() {
      return state;
    },
    getElementById: (id: string) => (id === "vprs-flight" ? el : null),
    addEventListener: (type: string, cb: () => void) => {
      (listeners[type] ??= []).push(cb);
    },
  };

  return {
    document,
    readsAt,
    /** The parser finishes: the element's text is now whole. */
    finishParsing() {
      state = "complete";
      text = PAYLOAD;
      for (const cb of listeners["DOMContentLoaded"] ?? []) cb();
    },
  };
}

describe("createReactFetcher inline flight payload", () => {
  beforeEach(() => {
    // The fetcher consumes the inlined payload once per module instance.
    vi.resetModules();
  });

  it("does NOT read the payload while the document is still parsing", async () => {
    const createReactFetcher = await importFetcher();
    const dom = stubParsingDocument("loading");
    vi.stubGlobal("document", dom.document);
    globalThis.fetch = vi.fn(async () => flightResponse()) as any;

    const content = createReactFetcher({
      url: "/",
      moduleBaseURL: "/",
      publicOrigin: "http://localhost",
    });
    // Swallow the decode: react-server-dom is not the subject here.
    Promise.resolve(content).then(
      () => {},
      () => {}
    );

    // The element exists, so the inlined payload is claimed — but its text must
    // NOT have been touched yet, because it is still being written.
    expect(dom.readsAt).toEqual([]);
    // ...and it must not have silently fallen back to the network either.
    expect(globalThis.fetch).not.toHaveBeenCalled();

    dom.finishParsing();
    await new Promise((r) => setTimeout(r, 0));

    // Read exactly once, and only after the document was parsed.
    expect(dom.readsAt).toEqual(["complete"]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("reads the payload immediately when the document is already parsed", async () => {
    const createReactFetcher = await importFetcher();
    const dom = stubParsingDocument("complete");
    vi.stubGlobal("document", dom.document);
    globalThis.fetch = vi.fn(async () => flightResponse()) as any;

    const content = createReactFetcher({
      url: "/",
      moduleBaseURL: "/",
      publicOrigin: "http://localhost",
    });
    Promise.resolve(content).then(
      () => {},
      () => {}
    );

    expect(dom.readsAt).toEqual(["complete"]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fetches index.rsc when the document carries no inlined payload", async () => {
    const createReactFetcher = await importFetcher();
    vi.stubGlobal("document", {
      readyState: "complete",
      getElementById: () => null,
      addEventListener: () => {},
    });
    globalThis.fetch = vi.fn(async () => flightResponse()) as any;

    createReactFetcher({
      url: "/",
      moduleBaseURL: "/",
      publicOrigin: "http://localhost",
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
