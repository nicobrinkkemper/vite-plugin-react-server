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
 * parser is still streaming text into that element, and `textContent` then holds
 * only the bytes seen so far. Decoding that yields a truncated flight stream:
 * React reaches the end of an incomplete payload and throws "Connection closed"
 * (#412), which the mount helper can only degrade on — the page never hydrates.
 *
 * The build stamps the payload's length on the opening tag, so a short read is
 * DETECTABLE rather than inferred from timing. Anything unusable — half-written,
 * truncated by an abandoned parse, or undecodable — must fall back to fetching
 * index.rsc, never throw.
 */
const PAYLOAD = Buffer.from('0:"ok"\n').toString("base64");

interface DomOptions {
  readyState?: "loading" | "complete";
  /** What the element holds right now. Defaults to the whole payload. */
  text?: string;
  /** The stamped length. `null` models HTML built before the stamp existed. */
  stamped?: number | null;
}

function stubDocument({
  readyState = "complete",
  text = PAYLOAD,
  stamped = PAYLOAD.length,
}: DomOptions = {}) {
  const listeners: Record<string, Array<() => void>> = {};
  /** readyState captured at each `textContent` access. */
  const readsAt: string[] = [];
  let state = readyState;
  let current = text;

  const el = {
    get textContent() {
      readsAt.push(state);
      return current;
    },
    getAttribute: (name: string) =>
      name === "data-length" && stamped !== null ? String(stamped) : null,
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
    /** The parser reaches the end of the document. `finalText` defaults to whole. */
    finishParsing(finalText = PAYLOAD) {
      state = "complete";
      current = finalText;
      for (const cb of listeners["DOMContentLoaded"] ?? []) cb();
    },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

/** react-server-dom is not the subject here; swallow the decode. */
const ignore = (content: unknown) =>
  Promise.resolve(content).then(
    () => {},
    () => {}
  );

describe("createReactFetcher inline flight payload", () => {
  beforeEach(() => {
    // The fetcher consumes the inlined payload once per module instance.
    vi.resetModules();
  });

  const fetcher = (createReactFetcher: any) =>
    createReactFetcher({
      url: "/",
      moduleBaseURL: "/",
      publicOrigin: "http://localhost",
    });

  it("waits for the parser rather than using a half-written payload", async () => {
    const createReactFetcher = await importFetcher();
    const dom = stubDocument({ readyState: "loading", text: PAYLOAD.slice(0, 4) });
    vi.stubGlobal("document", dom.document);
    globalThis.fetch = vi.fn(async () => flightResponse()) as any;

    ignore(fetcher(createReactFetcher));

    // The text is short, so it must not have been used — and it must not have
    // given up on the inlined payload either, since the rest is still coming.
    expect(globalThis.fetch).not.toHaveBeenCalled();

    dom.finishParsing();
    await settle();

    // Used the payload once it was whole; never touched the network.
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(dom.readsAt.at(-1)).toBe("complete");
  });

  it("uses a payload that is ALREADY whole, without waiting for the parser", async () => {
    const createReactFetcher = await importFetcher();
    // Parser still running, but this element is finished — the stamp proves it.
    const dom = stubDocument({ readyState: "loading", text: PAYLOAD });
    vi.stubGlobal("document", dom.document);
    globalThis.fetch = vi.fn(async () => flightResponse()) as any;

    ignore(fetcher(createReactFetcher));
    await settle();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(dom.readsAt).toEqual(["loading"]);
  });

  it("falls back to the network when an ABANDONED parse leaves the payload truncated", async () => {
    const createReactFetcher = await importFetcher();
    // Stop pressed / connection given up: DOMContentLoaded fires, text stays short.
    const dom = stubDocument({ readyState: "loading", text: PAYLOAD.slice(0, 4) });
    vi.stubGlobal("document", dom.document);
    globalThis.fetch = vi.fn(async () => flightResponse()) as any;

    const content = fetcher(createReactFetcher);

    dom.finishParsing(PAYLOAD.slice(0, 4));
    await settle();

    // Must fetch index.rsc instead of decoding a truncated flight stream...
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    // ...and must not reject: a throw here surfaces as an un-hydratable page.
    await expect(Promise.resolve(content)).resolves.toBeDefined();
  });

  it("falls back to the network when the payload is not decodable", async () => {
    const createReactFetcher = await importFetcher();
    const garbage = "!!!not base64!!!";
    const dom = stubDocument({
      readyState: "complete",
      text: garbage,
      stamped: garbage.length,
    });
    vi.stubGlobal("document", dom.document);
    globalThis.fetch = vi.fn(async () => flightResponse()) as any;

    const content = fetcher(createReactFetcher);
    await settle();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    await expect(Promise.resolve(content)).resolves.toBeDefined();
  });

  it("still waits for a parsed document when the HTML predates the length stamp", async () => {
    const createReactFetcher = await importFetcher();
    const dom = stubDocument({
      readyState: "loading",
      text: PAYLOAD.slice(0, 4),
      stamped: null,
    });
    vi.stubGlobal("document", dom.document);
    globalThis.fetch = vi.fn(async () => flightResponse()) as any;

    ignore(fetcher(createReactFetcher));
    expect(globalThis.fetch).not.toHaveBeenCalled();

    dom.finishParsing();
    await settle();

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

    fetcher(createReactFetcher);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

/**
 * The inline payload answers the request that produced the document. A first
 * fetch for ANOTHER url (a page whose client shows an inner route on first
 * load) must go to the network, and the payload must not be handed to a later
 * fetch either: only the first fetch may take it.
 */
describe("createReactFetcher inline flight url match", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const ask = (createReactFetcher: any, url: string, moduleBaseURL = "/") =>
    createReactFetcher({ url, moduleBaseURL, publicOrigin: "http://localhost" });

  const at = (pathname: string, search = "") =>
    vi.stubGlobal("window", { location: { pathname, search } });

  it("does not hand the payload to a first fetch for another url", async () => {
    at("/stage/projects/");
    const createReactFetcher = await importFetcher();
    vi.stubGlobal("document", stubDocument().document);
    globalThis.fetch = vi.fn(async () => flightResponse()) as any;

    ignore(ask(createReactFetcher, "/projects/"));
    await settle();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(String((globalThis.fetch as any).mock.calls[0][0])).toMatch(
      /\/projects\/index\.rsc$/
    );
  });

  it("keeps the payload away from a later fetch for the document url", async () => {
    at("/stage/projects/");
    const createReactFetcher = await importFetcher();
    vi.stubGlobal("document", stubDocument().document);
    globalThis.fetch = vi.fn(async () => flightResponse()) as any;

    ignore(ask(createReactFetcher, "/projects/"));
    ignore(ask(createReactFetcher, "/stage/projects/"));
    await settle();

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("still adopts the payload for the document url, under a deploy base", async () => {
    at("/app/about/");
    const createReactFetcher = await importFetcher();
    vi.stubGlobal("document", stubDocument().document);
    globalThis.fetch = vi.fn(async () => flightResponse()) as any;

    ignore(ask(createReactFetcher, "/about", "/app/"));
    await settle();

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("judges by the url the document was served for, not a rewritten address", async () => {
    // Client code rewrote the address before the first fetch; the navigation
    // entry still names the url the server rendered.
    at("/about/");
    vi.stubGlobal("performance", {
      getEntriesByType: (type: string) =>
        type === "navigation" ? [{ name: "http://localhost/" }] : [],
    });
    const createReactFetcher = await importFetcher();
    vi.stubGlobal("document", stubDocument().document);
    globalThis.fetch = vi.fn(async () => flightResponse()) as any;

    ignore(ask(createReactFetcher, "/about/"));
    await settle();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("drops a streamed payload for another url and swallows its late chunks", async () => {
    at("/stage/projects/");
    const G = globalThis as Record<string, unknown>;
    G.__vprsFlightChunks = [btoa('0:"stage"\n')];
    try {
      const createReactFetcher = await importFetcher();
      vi.stubGlobal("document", {
        readyState: "loading",
        getElementById: () => null,
        addEventListener: () => {},
      });
      globalThis.fetch = vi.fn(async () => flightResponse()) as any;

      ignore(ask(createReactFetcher, "/projects/"));
      await settle();

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const arr = G.__vprsFlightChunks as unknown[];
      arr.push("late");
      expect(arr).toHaveLength(0);
    } finally {
      delete G.__vprsFlightChunks;
    }
  });
});
