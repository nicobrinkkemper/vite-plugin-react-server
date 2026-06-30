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

  it("prerenders only the fully-static routes", () => {
    expect(new Set(r.build.pages)).toEqual(new Set(["/", "/profile/me"]));
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

  it("throws on an unmatched url", () => {
    expect(() => r.Page("/nope/x")).toThrow(/no route matches/);
  });

  it("extracts params for the loader (matched pattern), {} when unmatched", () => {
    expect(r.getParams("/profile/123")).toEqual({ id: "123" });
    expect(r.getParams("/blog/tech/rsc")).toEqual({ category: "tech", slug: "rsc" });
    expect(r.getParams("/profile/me")).toEqual({});
    expect(r.getParams("/nope/x")).toEqual({});
  });
});
