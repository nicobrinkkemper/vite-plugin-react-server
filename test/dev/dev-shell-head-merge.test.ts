import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { setupIndexHTML } from "../setup.js";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";

/**
 * The dev shell serves the DOCUMENT component's head: the served index.html
 * must carry the Html component's title/meta/style (rendered through the dev
 * worker's shell render and injected via transformIndexHtml), and the
 * hand-written index.html title must be gone — one source of truth, no
 * silent divergence between the dev shell and the production document.
 *
 * The first request can legitimately be served unmerged (the provider races
 * a cold worker boot against its render timeout and falls back to the plain
 * shell), so the assertions poll until the merge appears.
 */

let server: ViteDevServer;
const port = 3139;
const testDir = resolve(__dirname, "../fixtures/dev-shell-head-merge.test");

async function fetchShell(): Promise<string> {
  const res = await fetch(`http://localhost:${port}/`);
  expect(res.status).toBe(200);
  return res.text();
}

describe("dev shell head-merge", () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await setupIndexHTML(testDir);
    await mkdir(join(testDir, "src/page"), { recursive: true });
    await writeFile(
      join(testDir, "src/page/page.tsx"),
      `import React from "react";
export const Page = () => <div>Head Merge Test</div>;`
    );
    await writeFile(
      join(testDir, "src/page/props.ts"),
      `export const props = () => ({});`
    );
    await writeFile(
      join(testDir, "src/Html.tsx"),
      `import React from "react";
import { Root as DefaultRoot } from "vite-plugin-react-server/components";
import type { HtmlComponentType } from "vite-plugin-react-server/types";

export const Html: HtmlComponentType = ({
  Root = DefaultRoot,
  cssFiles,
  pageProps,
  Page,
  as = "div",
}) => {
  return React.createElement("html", { lang: "en" },
    React.createElement("head", {},
      React.createElement("title", {}, "Document Title From Html"),
      React.createElement("meta", { name: "description", content: "from-the-document" }),
      React.createElement("style", {}, ":root{--shell:1}")
    ),
    React.createElement("body", {},
      React.createElement(Root as React.ElementType, { as, id: "root", cssFiles, pageProps, Page })
    )
  );
};`
    );

    try {
      await symlink(
        resolve(__dirname, "../../node_modules"),
        join(testDir, "node_modules"),
        "dir"
      );
    } catch {}

    server = await createServer({
      mode: "test",
      root: testDir,
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          projectRoot: testDir,
          moduleBase: "src",
          verbose: true,
          Page: () => `src/page/page.tsx`,
          props: () => `src/page/props.ts`,
          Html: "src/Html.tsx",
        }),
      ],
      server: { port },
    });
    await server.listen();
  }, 60_000);

  afterAll(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      server?.close(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 15_000);
        timer.unref?.();
      }),
    ]);
    clearTimeout(timer);
    await rm(testDir, { recursive: true, force: true });
  }, 30_000);

  it("serves the document component's head in the dev shell", async () => {
    // Poll: the first response may race the cold worker boot and fall back
    // to the unmerged shell by design.
    let html = "";
    const deadline = Date.now() + 30_000;
    for (;;) {
      html = await fetchShell();
      if (html.includes("Document Title From Html") || Date.now() > deadline) {
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    // The document's head made it into the served shell…
    expect(html).toContain("<title>Document Title From Html</title>");
    expect(html).toContain('content="from-the-document"');
    expect(html).toContain(":root{--shell:1}");
    // …the hand-written title is gone (one source of truth)…
    expect(html).not.toContain("Test App");
    // …and the shell is still Vite's: entry script and mount node intact.
    expect(html).toContain('src="/src/client.tsx"');
    expect(html).toContain('<div id="root"></div>');
  }, 45_000);
});
