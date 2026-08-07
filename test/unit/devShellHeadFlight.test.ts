import { describe, it, expect } from "vitest";
import { extractHeadTagsFromFlight } from "../../plugin/dev-server/devShellHeadFlight.js";

/**
 * Wire-shaped flight rows (N:JSON model rows) for a full-document render:
 * html > (head, body). Mirrors the esm flight model format — element tuples
 * ["$", tag, key, props] with nested children.
 */
const PAYLOAD = [
  `0:["$","html",null,{"lang":"en","children":[["$","head",null,{"children":[["$","meta",null,{"charSet":"utf-8"}],["$","meta",null,{"name":"viewport","content":"width=device-width, initial-scale=1"}],["$","title",null,{"children":"My App — Home"}],["$","link",null,{"rel":"stylesheet","href":"/assets/main.css","precedence":"high"}],["$","style",null,{"children":":root{--x:1}"}],["$","script",null,{"type":"module","src":"/entry.js"}]]}],["$","body",null,{"children":["$","div",null,{"id":"root"}]}]]}]`,
  `1:{"name":"Page","env":"Server"}`,
].join("\n");

describe("extractHeadTagsFromFlight", () => {
  const tags = extractHeadTagsFromFlight(PAYLOAD);

  it("extracts whitelisted head elements in order", () => {
    expect(tags.map((t) => t.tag)).toEqual([
      "meta",
      "meta",
      "title",
      "link",
      "style",
    ]);
  });

  it("maps React prop names to HTML attribute names", () => {
    expect(tags[0].attrs).toEqual({ charset: "utf-8" });
  });

  it("keeps title and style children, and stringifies attr values", () => {
    expect(tags.find((t) => t.tag === "title")?.children).toBe(
      "My App — Home"
    );
    expect(tags.find((t) => t.tag === "style")?.children).toBe(":root{--x:1}");
    expect(tags.find((t) => t.tag === "link")?.attrs).toMatchObject({
      rel: "stylesheet",
      href: "/assets/main.css",
      precedence: "high",
    });
  });

  it("excludes scripts", () => {
    expect(tags.some((t) => t.tag === "script")).toBe(false);
  });

  it("returns [] when the head hides behind a reference placeholder", () => {
    const lazy = `0:["$","html",null,{"children":"$L1"}]`;
    expect(extractHeadTagsFromFlight(lazy)).toEqual([]);
  });

  it("returns [] for payloads without a document head", () => {
    const headless = `0:["$","div",null,{"children":"page only"}]`;
    expect(extractHeadTagsFromFlight(headless)).toEqual([]);
    expect(extractHeadTagsFromFlight("")).toEqual([]);
  });

  it("accepts dev-mode element tuples (owner/stack fields appended)", () => {
    const dev = `0:["$","html",null,{"children":[["$","head",null,{"children":[["$","title",null,{"children":"Dev Title"},"$1","$8",1]]},"$1","$7",1],["$","body",null,{"children":"$c"},"$1","$b",1]]},"$1","$6",1]`;
    const tags = extractHeadTagsFromFlight(dev);
    expect(tags.map((t) => t.tag)).toEqual(["title"]);
    expect(tags[0].children).toBe("Dev Title");
  });

  it("skips non-JSON rows without throwing", () => {
    const noisy = "2:T5,hello\n" + PAYLOAD;
    expect(extractHeadTagsFromFlight(noisy).length).toBe(5);
  });
});
