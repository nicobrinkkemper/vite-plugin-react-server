import { describe, it, expect, afterEach } from "vitest";
import { resolveChunkUrl } from "../../plugin/utils/flightClient.browser.js";

// The webpack flight's chunk ids are root-relative identity keys; the fetch
// URL derives from BASE_URL only. The SERVING origin loads chunks — a baked
// PUBLIC_ORIGIN must never leak in, or the bootstrap (injected same-origin)
// and the flight-loaded chunks split into two module graphs and two Reacts
// (the null-dispatcher class urls.test.ts pins for the esm path). Under
// vitest the #env node variant reads the mirrored VITE_ values live.
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

  it("leaves ids untouched at the root base", () => {
    process.env.VITE_BASE_URL = "/";
    delete process.env.VITE_PUBLIC_ORIGIN;
    expect(resolveChunkUrl("/components/Link-abc.js")).toBe(
      "/components/Link-abc.js"
    );
  });

  it("IGNORES a baked publicOrigin — chunks load from the serving origin", () => {
    process.env.VITE_BASE_URL = "/app/";
    process.env.VITE_PUBLIC_ORIGIN = "https://cdn.example";
    expect(resolveChunkUrl("/components/Link-abc.js")).toBe(
      "/app/components/Link-abc.js"
    );
  });

  it("never double-prefixes an already-based id", () => {
    process.env.VITE_BASE_URL = "/my-repo/";
    delete process.env.VITE_PUBLIC_ORIGIN;
    expect(resolveChunkUrl("/my-repo/components/Link-abc.js")).toBe(
      "/my-repo/components/Link-abc.js"
    );
  });

  it("passes through external urls (the explicit CDN escape hatch)", () => {
    process.env.VITE_BASE_URL = "/my-repo/";
    process.env.VITE_PUBLIC_ORIGIN = "https://cdn.example";
    expect(resolveChunkUrl("https://other.example/x.js")).toBe(
      "https://other.example/x.js"
    );
  });
});
