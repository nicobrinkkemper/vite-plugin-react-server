import { describe, expect, it } from "vitest";
import { fillPattern, matchRoute } from "../../plugin/router/matchRoute.js";

describe("fillPattern", () => {
  it("fills a single param", () => {
    expect(fillPattern("/profile/$id", { id: "5" })).toBe("/profile/5");
  });

  it("fills multiple params", () => {
    expect(fillPattern("/blog/$category/$slug", { category: "tech", slug: "rsc" })).toBe(
      "/blog/tech/rsc",
    );
  });

  it("returns / for the root pattern", () => {
    expect(fillPattern("/", {})).toBe("/");
  });

  it("keeps a catch-all's raw path", () => {
    expect(fillPattern("/files/$", { _splat: "a/b/c.png" })).toBe("/files/a/b/c.png");
  });

  it("percent-encodes named param values", () => {
    expect(fillPattern("/u/$name", { name: "a b" })).toBe("/u/a%20b");
  });

  it("throws when a named param is missing", () => {
    expect(() => fillPattern("/profile/$id", {})).toThrow(/missing param/);
  });

  it("round-trips with matchRoute", () => {
    const url = fillPattern("/blog/$category/$slug", { category: "x", slug: "y" });
    expect(matchRoute("/blog/$category/$slug", url)).toEqual({
      category: "x",
      slug: "y",
    });
  });
});
