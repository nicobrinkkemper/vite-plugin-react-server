import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * createFromNodeStream join contract: the SSR/static decode hands
 * moduleBaseURL to react-server-dom-esm's client.node, which composes
 * browser-facing script hoistables as `moduleBaseURL + id`. Ids are rooted,
 * so a base ending in "/" bakes protocol-relative "//…" script src into the
 * emitted HTML. Same contract createReactFetcher pins on the browser side.
 *
 * Isolated file so the vendor.client mock cannot leak into suites that need
 * the real vendored modules.
 */

describe("createFromNodeStream join contract", () => {
  const seen: string[] = [];

  beforeEach(() => {
    seen.length = 0;
    vi.resetModules();
    vi.doMock("../../plugin/vendor/vendor.client.js", () => ({
      React: {
        // Invoke function components eagerly so the decode call is observable.
        createElement: (type: unknown) =>
          typeof type === "function" ? (type as () => unknown)() : null,
        use: (value: unknown) => value,
      },
      ReactDOMClient: {
        createFromNodeStream: (
          _stream: unknown,
          _moduleRootPath: string,
          moduleBaseURL: string
        ) => {
          seen.push(moduleBaseURL);
          return Promise.resolve("ok");
        },
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock("../../plugin/vendor/vendor.client.js");
    vi.resetModules();
  });

  const decode = async (moduleBaseURL: string | undefined) => {
    const { createFromNodeStream } = await import(
      "../../plugin/stream/createFromNodeStream.client.js"
    );
    createFromNodeStream({
      rscStream: { readable: true } as never,
      moduleRootPath: "/tmp/dist/client",
      moduleBasePath: "/",
      moduleBaseURL,
    } as never);
  };

  it.each([
    ["/", ""],
    ["/app/", "/app"],
    ["https://cdn.example.com/", "https://cdn.example.com"],
  ])(
    "strips the trailing slash before handing %s to the flight client",
    async (base, expected) => {
      await decode(base);
      expect(seen).toEqual([expected]);
    }
  );

  it("defaults a missing base to the rooted-id-safe empty string", async () => {
    await decode(undefined);
    expect(seen).toEqual([""]);
  });

  it("never composes a protocol-relative URL with a rooted id", async () => {
    await decode("/");
    const id = "/components/SimCanvas.client-15sninn.js";
    expect(`${seen[0]}${id}`).toBe(id);
    expect(`${seen[0]}${id}`.startsWith("//")).toBe(false);
  });
});
