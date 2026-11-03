import { describe, expect, it } from "vitest";
import { mergeHead } from "../../plugin/router/head.js";

describe("mergeHead", () => {
  it("leaf title wins", () => {
    expect(
      mergeHead([{ title: "root" }, undefined, { title: "leaf" }]).title,
    ).toBe("leaf");
  });

  it("keeps an ancestor title when the leaf contributes none", () => {
    expect(mergeHead([{ title: "root" }, { meta: [] }]).title).toBe("root");
  });

  it("keyed meta overrides an ancestor's same-key entry", () => {
    const merged = mergeHead([
      { meta: [{ name: "description", content: "root" }] },
      { meta: [{ name: "description", content: "leaf" }] },
    ]);
    expect(merged.meta).toEqual([{ name: "description", content: "leaf" }]);
  });

  it("unkeyed meta entries append instead of replacing", () => {
    const merged = mergeHead([
      { meta: [{ itemProp: "a", content: "first" }] },
      { meta: [{ content: "loose" }] },
    ]);
    expect(merged.meta).toHaveLength(2);
  });

  it("property-keyed (open graph) meta dedupes like name-keyed", () => {
    const merged = mergeHead([
      { meta: [{ property: "og:title", content: "a" }] },
      { meta: [{ property: "og:title", content: "b" }] },
    ]);
    expect(merged.meta).toEqual([{ property: "og:title", content: "b" }]);
  });

  it("leaf lang wins", () => {
    expect(
      mergeHead([{ lang: "en" }, undefined, { lang: "nl" }]).lang,
    ).toBe("nl");
  });

  it("keeps an ancestor lang when the leaf contributes none", () => {
    expect(mergeHead([{ lang: "nl" }, { title: "leaf" }]).lang).toBe("nl");
    expect(mergeHead([{ title: "only" }]).lang).toBeUndefined();
  });

  it("drops charset meta: the document is always UTF-8", () => {
    const merged = mergeHead([
      { meta: [{ charSet: "iso-8859-1" }] },
      {
        meta: [
          { charset: "windows-1252" },
          { name: "description", content: "d" },
        ],
      },
    ]);
    expect(merged.meta).toEqual([{ name: "description", content: "d" }]);
  });

  it("links concatenate root→leaf", () => {
    const merged = mergeHead([
      { links: [{ rel: "canonical", href: "/a" }] },
      { links: [{ rel: "alternate", href: "/b" }] },
    ]);
    expect(merged.links).toHaveLength(2);
  });
});
