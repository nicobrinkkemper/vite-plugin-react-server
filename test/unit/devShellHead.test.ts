import { describe, it, expect } from "vitest";
import {
  extractDocumentHeadTags,
  mergeDevShellHead,
} from "../../plugin/dev-server/devShellHead.js";

const DOC = `<!DOCTYPE html><html lang="en"><head>
<link rel="stylesheet" href="/assets/main.css" data-precedence="high"/>
<meta charSet="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>My App — Home</title>
<style>:root{--x:1}</style>
<script type="module" src="/entry.js"></script>
</head><body><div id="root"></div></body></html>`;

describe("extractDocumentHeadTags", () => {
  const tags = extractDocumentHeadTags(DOC);

  it("extracts the whitelisted head elements in document order", () => {
    expect(tags.map((t) => t.tag)).toEqual([
      "link",
      "meta",
      "meta",
      "title",
      "style",
    ]);
  });

  it("keeps attributes, including valueless ones", () => {
    const link = tags[0];
    expect(link.attrs).toMatchObject({
      rel: "stylesheet",
      href: "/assets/main.css",
    });
    const viewport = tags[2];
    expect(viewport.attrs).toMatchObject({
      name: "viewport",
      content: "width=device-width, initial-scale=1",
    });
  });

  it("keeps title and style children", () => {
    expect(tags.find((t) => t.tag === "title")?.children).toBe(
      "My App — Home"
    );
    expect(tags.find((t) => t.tag === "style")?.children).toBe(
      ":root{--x:1}"
    );
  });

  it("excludes scripts — the dev shell has its own entry", () => {
    expect(tags.some((t) => t.tag === "script")).toBe(false);
  });

  it("returns empty for a document without a head", () => {
    expect(extractDocumentHeadTags("<html><body/></html>")).toEqual([]);
  });
});

describe("mergeDevShellHead", () => {
  const INDEX = `<!DOCTYPE html><html><head>
  <meta charset="UTF-8" />
  <title>hand-written dev title</title>
  <link rel="icon" href="/favicon.ico" />
</head><body><div id="root"></div><script type="module" src="/src/client.tsx"></script></body></html>`;

  it("drops the index.html title when the document provides one", () => {
    const { html } = mergeDevShellHead(INDEX, extractDocumentHeadTags(DOC));
    expect(html).not.toContain("hand-written dev title");
    expect(html).toContain('rel="icon"'); // everything else untouched
  });

  it("keeps the index.html title when the document has none", () => {
    const { html } = mergeDevShellHead(
      INDEX,
      extractDocumentHeadTags("<html><head><meta name=\"a\" content=\"b\"/></head></html>")
    );
    expect(html).toContain("hand-written dev title");
  });

  it("passes the document tags through for injection", () => {
    const tags = extractDocumentHeadTags(DOC);
    expect(mergeDevShellHead(INDEX, tags).tags).toBe(tags);
  });
});
