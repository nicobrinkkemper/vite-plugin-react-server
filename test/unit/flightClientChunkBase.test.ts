import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { withAppBase } from "../../plugin/utils/flightClient.browser.js";

// The webpack flight's chunk ids are root-relative identity keys; the fetch
// URL must derive from the app's base at load time (transport parity with the
// esm client's moduleBaseURL resolution). Under vitest the #env node variant
// reads the mirrored VITE_BASE_URL live, so the base is settable per test.
describe("withAppBase", () => {
  const saved = process.env.VITE_BASE_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.VITE_BASE_URL;
    else process.env.VITE_BASE_URL = saved;
  });

  it("prefixes root-relative chunk ids under a subpath base", () => {
    process.env.VITE_BASE_URL = "/my-repo/";
    expect(withAppBase("/components/Link-abc.js")).toBe(
      "/my-repo/components/Link-abc.js"
    );
  });

  it("leaves ids untouched at the root base", () => {
    process.env.VITE_BASE_URL = "/";
    expect(withAppBase("/components/Link-abc.js")).toBe(
      "/components/Link-abc.js"
    );
  });

  it("never double-prefixes an already-based id", () => {
    process.env.VITE_BASE_URL = "/my-repo/";
    expect(withAppBase("/my-repo/components/Link-abc.js")).toBe(
      "/my-repo/components/Link-abc.js"
    );
  });

  it("passes through external and protocol-relative urls", () => {
    process.env.VITE_BASE_URL = "/my-repo/";
    expect(withAppBase("https://cdn.example/x.js")).toBe(
      "https://cdn.example/x.js"
    );
    expect(withAppBase("//cdn.example/x.js")).toBe("//cdn.example/x.js");
  });
});
