import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * The browser flight-client chooser must follow the transport hint: a
 * webpack-transport document injects `self.__vprsFlightTransport = "webpack"`
 * and every browser decode path (initial payload, refetch, and the server-fn
 * proxy's callServer) must then use the webpack client — the esm decoder
 * mis-reads webpack reference rows (the export-name slot receives the chunk
 * array), silently resolving components to undefined. Without the hint the
 * esm client is the default, unchanged.
 */

vi.mock("react-server-loader/webpack/runtime", () => ({
  createWebpackClient: vi.fn(async () => ({
    createFromReadableStream: vi.fn(),
    createFromFetch: vi.fn(async () => ({ returnValue: "webpack" })),
    encodeReply: vi.fn(async () => "webpack-body"),
    flavor: "webpack",
  })),
}));

vi.mock("react-server-dom-esm/client.browser", () => ({
  createFromReadableStream: vi.fn(),
  createFromFetch: vi.fn(async () => ({ returnValue: "esm" })),
  encodeReply: vi.fn(async () => "esm-body"),
  flavor: "esm",
}));

afterEach(() => {
  delete (globalThis as { __vprsFlightTransport?: string })
    .__vprsFlightTransport;
  vi.unstubAllGlobals();
});

describe("loadBrowserFlightClient", () => {
  it("defaults to the esm client", async () => {
    const { loadBrowserFlightClient } = await import(
      "../../plugin/utils/flightClient.browser.js"
    );
    const client = (await loadBrowserFlightClient()) as { flavor?: string };
    expect(client.flavor).toBe("esm");
  });

  it("picks the webpack client when the document hints webpack transport", async () => {
    (globalThis as { __vprsFlightTransport?: string }).__vprsFlightTransport =
      "webpack";
    const { loadBrowserFlightClient } = await import(
      "../../plugin/utils/flightClient.browser.js"
    );
    const client = (await loadBrowserFlightClient()) as { flavor?: string };
    expect(client.flavor).toBe("webpack");
  });
});

describe("createCallServer transport dispatch", () => {
  it("encodes and decodes through the webpack client under the hint", async () => {
    (globalThis as { __vprsFlightTransport?: string }).__vprsFlightTransport =
      "webpack";
    const { createCallServer } = await import(
      "../../plugin/utils/createCallServer.js"
    );
    const seen: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        seen.push(init ?? {});
        return new Response("", {
          status: 200,
          headers: { "content-type": "text/x-component" },
        });
      })
    );
    const result = await createCallServer("/")("some/action#run", [1]);
    expect(result).toBe("webpack");
    expect(seen[0]?.body).toBe("webpack-body");
  });

  it("stays on the esm client without the hint", async () => {
    const { createCallServer } = await import(
      "../../plugin/utils/createCallServer.js"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("", {
            status: 200,
            headers: { "content-type": "text/x-component" },
          })
      )
    );
    const result = await createCallServer("/")("some/action#run", [1]);
    expect(result).toBe("esm");
  });
});
