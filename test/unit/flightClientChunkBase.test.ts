import { describe, it, expect, afterEach } from "vitest";
import { resolveChunkUrl } from "../../plugin/utils/flightClient.browser.js";

// The webpack flight's chunk ids are root-relative identity keys; the fetch
// URL derives from PUBLIC_ORIGIN + BASE_URL at load time — the same
// composition the esm client's moduleBaseURL uses. Under vitest the #env node
// variant reads the mirrored VITE_ values live, so both knobs are settable
// per test.
describe("resolveChunkUrl", () => {
  const savedBase = process.env.VITE_BASE_URL;
  const savedOrigin = process.env.VITE_PUBLIC_ORIGIN;
  afterEach(() => {
    if (savedBase === undefined) delete process.env.VITE_BASE_URL;
    else process.env.VITE_BASE_URL = savedBase;
    if (savedOrigin === undefined) delete process.env.VITE_PUBLIC_ORIGIN;
    else process.env.VITE_PUBLIC_ORIGIN = savedOrigin;
  });

  it("prefixes root-relative chunk ids under a subpath base", () => {
    process.env.VITE_BASE_URL = "/my-repo/";
    delete process.env.VITE_PUBLIC_ORIGIN;
    expect(resolveChunkUrl("/components/Link-abc.js")).toBe(
      "/my-repo/components/Link-abc.js"
    );
  });

  it("leaves ids untouched at the root base with no origin", () => {
    process.env.VITE_BASE_URL = "/";
    delete process.env.VITE_PUBLIC_ORIGIN;
    expect(resolveChunkUrl("/components/Link-abc.js")).toBe(
      "/components/Link-abc.js"
    );
  });

  it("applies publicOrigin after the base — the documented contract", () => {
    process.env.VITE_BASE_URL = "/app/";
    process.env.VITE_PUBLIC_ORIGIN = "https://cdn.example";
    expect(resolveChunkUrl("/components/Link-abc.js")).toBe(
      "https://cdn.example/app/components/Link-abc.js"
    );
  });

  it("applies publicOrigin at the root base", () => {
    process.env.VITE_BASE_URL = "/";
    process.env.VITE_PUBLIC_ORIGIN = "https://cdn.example";
    expect(resolveChunkUrl("/components/Link-abc.js")).toBe(
      "https://cdn.example/components/Link-abc.js"
    );
  });

  it("never double-prefixes an already-based id", () => {
    process.env.VITE_BASE_URL = "/my-repo/";
    delete process.env.VITE_PUBLIC_ORIGIN;
    expect(resolveChunkUrl("/my-repo/components/Link-abc.js")).toBe(
      "/my-repo/components/Link-abc.js"
    );
  });

  it("passes through external urls", () => {
    process.env.VITE_BASE_URL = "/my-repo/";
    process.env.VITE_PUBLIC_ORIGIN = "https://cdn.example";
    expect(resolveChunkUrl("https://other.example/x.js")).toBe(
      "https://other.example/x.js"
    );
  });
});
