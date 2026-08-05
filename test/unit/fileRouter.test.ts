import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fileRouter } from "../../plugin/router/fileRouter.js";

const ROUTES = join(
  dirname(fileURLToPath(import.meta.url)),
  "../router-fixtures/routes",
);

describe("fileRouter", () => {
  const r = fileRouter(ROUTES);

  it("prerenders only the fully-static routes (no staticPaths)", () => {
    expect(new Set(r.build.pages as string[])).toEqual(
      new Set(["/", "/profile/me", "/files"]),
    );
  });

  it("enumerates dynamic routes via staticPaths into an async build.pages", async () => {
    const withPaths = fileRouter(ROUTES, {
      staticPaths: {
        "/profile/$id": () => [{ id: "1" }, { id: "2" }],
        "/blog/$category/$slug": async () => ["/blog/tech/rsc"], // full urls allowed too
        // "/files/$" intentionally omitted → stays server-only
      },
    });
    expect(typeof withPaths.build.pages).toBe("function");
    const pages = await (withPaths.build.pages as () => Promise<string[]>)();
    expect(new Set(pages)).toEqual(
      new Set([
        "/",
        "/profile/me",
        "/files",
        "/profile/1",
        "/profile/2",
        "/blog/tech/rsc",
      ]),
    );
    // The catch-all itself has no staticPaths entry → stays server-only.
    expect(pages.filter((p) => p.startsWith("/files"))).toEqual(["/files"]);
  });

  it("resolves Page by matching the url (static beats param)", () => {
    expect(r.Page("/profile/me")).toMatch(/profile\/me\/page\.tsx$/);
    expect(r.Page("/profile/123")).toMatch(/profile\/\$id\/page\.tsx$/);
    expect(r.Page("/")).toMatch(/routes\/page\.tsx$/);
  });

  it("resolves props for a dynamic route, undefined when absent", () => {
    expect(r.props("/profile/123")).toMatch(/profile\/\$id\/props\.ts$/);
    expect(r.props("/profile/me")).toBeUndefined();
  });

  it("matches catch-all routes", () => {
    expect(r.Page("/files/a/b.png")).toMatch(/files\/\$\/page\.tsx$/);
  });

  it("prefers the index route over its catch-all sibling's empty splat", () => {
    expect(r.Page("/files")).toMatch(/files\/page\.tsx$/);
    expect(r.Page("/files/")).toMatch(/files\/page\.tsx$/);
    expect(r.Page("/files/a")).toMatch(/files\/\$\/page\.tsx$/);
  });

  // The dev server resolves the browser's suffixed flight urls
  // (`/profile/123/index.rsc`) through the same router functions as folder
  // urls; the transport suffix must not read as a path segment.
  it("strips the transport suffix before matching", () => {
    expect(r.Page("/profile/123/index.rsc")).toMatch(
      /profile\/\$id\/page\.tsx$/,
    );
    expect(r.getParams("/profile/123/index.rsc")).toEqual({ id: "123" });
    expect(r.Page("/index.rsc")).toMatch(/routes\/page\.tsx$/);
    expect(r.Page("/files/index.rsc")).toMatch(/files\/page\.tsx$/);
    // .html strips too (prerendered-transport form).
    expect(r.getParams("/profile/42.html")).toEqual({ id: "42" });
  });

  it("honors a custom rscOutputPath suffix", () => {
    const custom = fileRouter(ROUTES, { rscOutputPath: "payload.rsc" });
    expect(custom.Page("/profile/123/payload.rsc")).toMatch(
      /profile\/\$id\/page\.tsx$/,
    );
    expect(custom.getParams("/profile/123/payload.rsc")).toEqual({
      id: "123",
    });
  });

  it("throws on an unmatched url", () => {
    expect(() => r.Page("/nope/x")).toThrow(/no route matches/);
  });

  it("extracts params for the loader (matched pattern), {} when unmatched", () => {
    expect(r.getParams("/profile/123")).toEqual({ id: "123" });
    expect(r.getParams("/blog/tech/rsc")).toEqual({ category: "tech", slug: "rsc" });
    expect(r.getParams("/profile/me")).toEqual({});
    expect(r.getParams("/nope/x")).toEqual({});
  });

  it("emits page/props paths relative to `root` (cwd ≠ project root)", () => {
    // ROUTES is <fixtures>/router-fixtures/routes; scanning it with the fixtures
    // dir as root must yield project-root-relative, posix-slashed paths.
    const projectRoot = join(ROUTES, "../..");
    const rr = fileRouter(ROUTES, { root: projectRoot });
    expect(rr.Page("/profile/123")).toBe(
      "router-fixtures/routes/profile/$id/page.tsx",
    );
    expect(rr.props("/profile/123")).toBe(
      "router-fixtures/routes/profile/$id/props.ts",
    );
    expect(rr.Page("/")).toBe("router-fixtures/routes/page.tsx");
    // Matching + params are unaffected by the root rewrite.
    expect(rr.getParams("/profile/123")).toEqual({ id: "123" });
  });
});
