import { describe, it, expect, afterEach } from "vitest";
import {
  createLazyVendorModule,
  reactModeFromCache,
  reactPairedMode,
} from "../../plugin/vendor/lazyVendorModule.js";
import { assertRendererElementParity } from "../../plugin/utils/assertRendererElementParity.js";

const ORIGINAL_NODE_ENV = process.env["NODE_ENV"];

afterEach(() => {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env["NODE_ENV"];
  } else {
    process.env["NODE_ENV"] = ORIGINAL_NODE_ENV;
  }
});

describe("createLazyVendorModule", () => {
  it("does not load at creation time", () => {
    let loads = 0;
    const lazy = createLazyVendorModule(() => {
      loads++;
      return { render: () => "ok" };
    });
    expect(loads).toBe(0);
    expect(lazy.getLoadedMode()).toBe(null);
  });

  it("samples NODE_ENV at FIRST USE, not at import — the flip ordering", () => {
    // The crash scenario: plugin imported while NODE_ENV is unset/development,
    // tooling sets NODE_ENV=production AFTERWARDS, then the first render
    // happens. An eager require locks the DEVELOPMENT renderer; lazy loading
    // must resolve PRODUCTION.
    process.env["NODE_ENV"] = "development";
    const lazy = createLazyVendorModule(() => ({ render: () => "ok" }));

    process.env["NODE_ENV"] = "production";
    void lazy.proxy.render; // first property access triggers the load

    expect(lazy.getLoadedMode()).toBe("production");
  });

  it("loads once and keeps the first-resolved mode", () => {
    let loads = 0;
    process.env["NODE_ENV"] = "production";
    const lazy = createLazyVendorModule(() => {
      loads++;
      return { a: 1, b: 2 };
    });

    void lazy.proxy.a;
    process.env["NODE_ENV"] = "development";
    void lazy.proxy.b;

    expect(loads).toBe(1);
    expect(lazy.getLoadedMode()).toBe("production");
  });

  it("proxy forwards property access, `in`, and key enumeration", () => {
    const lazy = createLazyVendorModule(() => ({ render: () => "rendered" }));
    expect(lazy.proxy.render()).toBe("rendered");
    expect("render" in lazy.proxy).toBe(true);
    expect(Object.keys(lazy.proxy)).toContain("render");
  });

  it("passes the resolved mode to the loader (explicit-variant requires)", () => {
    let seenMode: string | null = null;
    process.env["NODE_ENV"] = "production";
    const lazy = createLazyVendorModule((mode) => {
      seenMode = mode;
      return { ok: true };
    });
    void lazy.proxy.ok;
    expect(seenMode).toBe("production");
  });

  it("prefers the ground-truth detector over the requested mode", () => {
    // The CJS cache may already hold the OTHER variant — load() returns it
    // regardless of what resolveMode asked for, and getLoadedMode must
    // report what actually evaluated, not what was intended.
    process.env["NODE_ENV"] = "production";
    const lazy = createLazyVendorModule(
      () => ({ ok: true }),
      () => "production",
      () => "development" // ground truth disagrees
    );
    void lazy.proxy.ok;
    expect(lazy.getLoadedMode()).toBe("development");
  });
});

describe("reactPairedMode", () => {
  it("pairs with the React copy already in the require cache, over NODE_ENV", () => {
    // The test process itself has react loaded (vitest setup / other suites),
    // so reactModeFromCache() reflects the process's locked-in variant; a
    // conflicting NODE_ENV must NOT override it. (This is the
    // "dispatcher.getOwner is not a function" pairing rule.)
    const cached = reactModeFromCache();
    if (cached === null) {
      // react genuinely not loaded in this worker — fallback is NODE_ENV
      process.env["NODE_ENV"] = "production";
      expect(reactPairedMode()).toBe("production");
      return;
    }
    process.env["NODE_ENV"] =
      cached === "production" ? "development" : "production";
    expect(reactPairedMode()).toBe(cached);
  });
});

describe("assertRendererElementParity", () => {
  const devElement = { $$typeof: Symbol.for("react.element"), _store: {} };
  const prodElement = { $$typeof: Symbol.for("react.element") };

  it("throws a clear diagnostic for dev renderer + prod element", () => {
    expect(() =>
      assertRendererElementParity(prodElement, "development", "test")
    ).toThrow(/DEVELOPMENT build.*PRODUCTION react\/jsx-runtime/s);
  });

  it("throws a clear diagnostic for prod renderer + dev element (getOwner crash class)", () => {
    expect(() =>
      assertRendererElementParity(devElement, "production", "test")
    ).toThrow(/PRODUCTION build.*DEVELOPMENT react\/jsx-runtime/s);
  });

  it("passes for matched pairs in both modes", () => {
    expect(() =>
      assertRendererElementParity(devElement, "development", "test")
    ).not.toThrow();
    expect(() =>
      assertRendererElementParity(prodElement, "production", "test")
    ).not.toThrow();
  });

  it("ignores wrapper node types that legitimately carry no _store", () => {
    // React.memo / lazy / portal roots have different $$typeof values and no
    // _store even in development — they must not trip the heuristic.
    const memoNode = { $$typeof: Symbol.for("react.memo") };
    const lazyNode = { $$typeof: Symbol.for("react.lazy") };
    expect(() =>
      assertRendererElementParity(memoNode, "development", "test")
    ).not.toThrow();
    expect(() =>
      assertRendererElementParity(lazyNode, "development", "test")
    ).not.toThrow();
  });

  it("skips non-element values and unloaded renderers", () => {
    expect(() =>
      assertRendererElementParity("a string child", "development", "test")
    ).not.toThrow();
    expect(() =>
      assertRendererElementParity(null, "development", "test")
    ).not.toThrow();
    expect(() =>
      assertRendererElementParity(prodElement, null, "test")
    ).not.toThrow();
  });
});
