import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * createReactFetcher AbortSignal support (bd: stale in-flight RSC streams
 * can't be cancelled).
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
