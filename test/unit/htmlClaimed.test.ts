import { describe, it, expect } from "vitest";
import { htmlClaimedKeys } from "../../plugin/bundle/htmlClaimed.js";

// The consumer bake must leave the browser entry out of its registry: it is a
// "use client" file (so it looks like a reference) whose top level calls
// startClient(), and importing it inside the bake dies on `document`. The two
// bundlers record the html input differently, so the claim has to hold on
// both shapes — these are lifted from the zero-client-reference edge build.
describe("htmlClaimedKeys", () => {
  const indexHtml =
    `<!DOCTYPE html><html><head></head><body><div id="root"></div>` +
    `<script type="module" src="/src/client.tsx"></script></body></html>`;
  const read = (files: Record<string, string>) => (key: string) => files[key];

  it("Rolldown (Vite 8): the html key and its imports", () => {
    const manifest = {
      "index.html": { file: "index.js", imports: ["src/client.tsx"] },
      "src/client.tsx": { file: "client-846qiu.js" },
      "../../../dist/plugin/router/startClient.js": {
        file: "dist/plugin/router/startClient-th3yfz.js",
      },
    };
    const claimed = htmlClaimedKeys(manifest, read({ "index.html": indexHtml }));
    expect([...claimed].sort()).toEqual(["index.html", "src/client.tsx"]);
  });

  it("Rollup (Vite 6/7): no html key, the entry is found through the html source", () => {
    const manifest = {
      "src/client.tsx": {
        file: "client-846qiu.js",
        imports: ["../../../dist/plugin/router/startClient.js"],
      },
      "../../../dist/plugin/router/startClient.js": {
        file: "dist/plugin/router/startClient-th3yfz.js",
      },
    };
    const claimed = htmlClaimedKeys(manifest, read({ "index.html": indexHtml }));
    expect(claimed.has("src/client.tsx")).toBe(true);
    expect(claimed.has("../../../dist/plugin/router/startClient.js")).toBe(false);
  });

  it("never claims a client reference", () => {
    const manifest = {
      "src/client.tsx": { file: "client-846qiu.js" },
      "src/routes/Counter.client.tsx": { file: "routes/Counter.client-89bov6.js" },
    };
    const claimed = htmlClaimedKeys(manifest, read({ "index.html": indexHtml }));
    expect(claimed.has("src/routes/Counter.client.tsx")).toBe(false);
  });

  it("claims nothing when the project has no html input", () => {
    const manifest = {
      "src/routes/Counter.client.tsx": { file: "routes/Counter.client-89bov6.js" },
    };
    expect(htmlClaimedKeys(manifest, read({})).size).toBe(0);
  });

  it("resolves relative and nested script paths against the html, skips external ones", () => {
    const manifest = { "pages/about.html": { file: "pages/about.js" } };
    const html =
      `<script src="./main.ts"></script>` +
      `<script src="../src/shared.ts"></script>` +
      `<script src="https://cdn.example/x.js"></script>` +
      `<script src="//cdn.example/y.js"></script>`;
    const claimed = htmlClaimedKeys(manifest, read({ "pages/about.html": html }), []);
    expect([...claimed].sort()).toEqual([
      "pages/about.html",
      "pages/main.ts",
      "src/shared.ts",
    ]);
  });
});
