import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * createReactFetcher join contract: the base handed to the flight
 * client must not end in "/" once ids are rooted, or `base + id` composes
 * "//…" and the browser loads shared chunks under two identities.
 *
 * Isolated file so the client.browser mock cannot leak into the AbortSignal /
 * inline-flight suites in createReactFetcher.test.ts.
 */

const ORIGINAL_FETCH = globalThis.fetch;

function flightResponse(body = '0:"ok"\n'): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/x-component" },
  });
}

describe("createReactFetcher join contract", () => {
  const seen: Array<{ moduleBaseURL?: string }> = [];

  beforeEach(() => {
    seen.length = 0;
    vi.resetModules();
    vi.doMock("react-server-dom-esm/client.browser", () => ({
      createFromFetch: (
        _response: Promise<Response>,
        opts: { moduleBaseURL?: string }
      ) => {
        seen.push(opts);
        return Promise.resolve("ok");
      },
      createFromReadableStream: (
        _stream: ReadableStream,
        opts: { moduleBaseURL?: string }
      ) => {
        seen.push(opts);
        return Promise.resolve("ok");
      },
    }));
    vi.stubGlobal("window", { location: { pathname: "/" } });
    vi.stubGlobal("document", {
      readyState: "complete",
      getElementById: () => null,
      addEventListener: () => {},
    });
    globalThis.fetch = vi.fn(async () => flightResponse()) as any;
  });

  afterEach(() => {
    vi.doUnmock("react-server-dom-esm/client.browser");
    vi.unstubAllGlobals();
    globalThis.fetch = ORIGINAL_FETCH;
    vi.resetModules();
  });

  it("strips trailing slashes from moduleBaseURL before handing it to the flight client", async () => {
    const { createReactFetcher } = await import(
      "../../plugin/utils/createReactFetcher.js"
    );
    const content = createReactFetcher({
      url: "/",
      moduleBaseURL: "/",
      publicOrigin: "http://localhost:4173/",
    });
    await Promise.resolve(content);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(seen.length).toBeGreaterThan(0);
    for (const opts of seen) {
      expect(opts.moduleBaseURL).toBeDefined();
      expect(opts.moduleBaseURL).not.toMatch(/\/$/);
    }
  });
});
