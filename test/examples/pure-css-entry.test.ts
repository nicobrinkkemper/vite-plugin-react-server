import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "path";
import { mkdir, writeFile, readdir } from "fs/promises";
import type {
  PluginEvent,
  FileWriteDoneEvent,
} from "../../dist/plugin/types.js";
import { doBuild } from "../doBuild.js";

// A bare .css file under moduleBase is auto-discovered as a build entry in
// every environment (autoDiscover.cssEntry "**/*.css"). In the server
// environment on rolldown-vite this becomes a "pure CSS entry": rolldown
// produces a JS placeholder chunk and vite:css-post emits the stylesheet as
// an asset via referenceId, then in generateBundle transfers metadata from
// the placeholder onto bundle[getFileName(ref)] WITHOUT a null guard. If the
// server environment never adds that asset to its bundle, the whole build
// dies with `TypeError: Cannot read properties of undefined (reading
// 'viteMetadata')` — even though nothing downstream needs the asset.
describe("pure css entry (server environment)", () => {
  const testDir = resolve(__dirname, "../fixtures/pure-css-entry.test");
  let events: PluginEvent[];

  beforeAll(async () => {
    // Hand-rolled minimal scaffold (NOT setupTestProject): the shared
    // scaffold ships .module.css pages, and the css-modules pipeline lazily
    // require()s postcss — under full-suite worker load that intermittently
    // dies with Node's "Cannot require() ES Module ... in a cycle". This
    // repro needs plain css only, so it avoids the css-modules path
    // entirely.
    await mkdir(resolve(testDir, "src/page"), { recursive: true });
    await writeFile(
      resolve(testDir, "index.html"),
      `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><title>Pure CSS Entry</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client.tsx"></script>
  </body>
</html>
`
    );

    // Bare css files under moduleBase are auto-discovered ENTRIES, and both
    // are ALSO statically imported by modules in the graph — the client entry
    // and a server-rendered component. Entry + imported is the shape whose
    // server-env placeholder chunk takes vite:css-post's pure-css path; an
    // unimported css entry never does.
    // The url() references are load-bearing for the repro: they populate the
    // placeholder's viteMetadata.importedAssets, which is what forces
    // vite:css-post's metadata transfer onto the (absent) real css asset. A
    // pure-css entry WITHOUT asset refs takes the safe path and never
    // crashed.
    // Must exceed build.assetsInlineLimit (4096) — smaller refs are inlined
    // as data URLs and never reach importedAssets.
    await mkdir(resolve(testDir, "src/fonts"), { recursive: true });
    await writeFile(
      resolve(testDir, "src/fonts/body.woff2"),
      Buffer.alloc(8192, 0x77)
    );
    await writeFile(
      resolve(testDir, "src/globalStyles.css"),
      `@font-face { font-family: Body; src: url("./fonts/body.woff2"); }
body { margin: 0; background: #fafafa; font-family: Body; }`
    );
    await writeFile(
      resolve(testDir, "src/client.tsx"),
      `import "./globalStyles.css"
import React from 'react'
import { createRoot } from 'react-dom/client'
const root = createRoot(document.getElementById('root')!)
root.render(<div>Client App</div>)
`
    );
    await mkdir(resolve(testDir, "src/components"), { recursive: true });
    await writeFile(
      resolve(testDir, "src/components/flag-icons.css"),
      `.flag { width: 16px; height: 12px; }`
    );
    await writeFile(
      resolve(testDir, "src/components/Flag.tsx"),
      `import React from "react";
import "./flag-icons.css";

export function Flag({ code }: { code: string }) {
  return <span className={"flag flag-" + code} />;
}
`
    );
    await writeFile(
      resolve(testDir, "src/page/page.tsx"),
      `import React from "react";
import { Flag } from "../components/Flag.js";

export function Page(props: any) {
  return (
    <div>
      <h1>Pure CSS Entry Test</h1>
      <Flag code="nl" />
    </div>
  );
}
`
    );
    await writeFile(
      resolve(testDir, "src/page/props.ts"),
      `export const props = (url: string) => ({ url });`
    );

    // css.inlineThreshold makes vprs inline small stylesheets into the
    // document instead of shipping them as assets — the server env then has
    // no css asset for vite:css-post's pure-css-entry bookkeeping to find.
    ({ events } = await doBuild({
      projectRoot: testDir,
      css: { inlineThreshold: 4096 },
    }));
  }, 120_000);

  it("builds and renders the page", () => {
    const routeErrors = events.filter((e) => e.type === "route.error");
    expect(routeErrors).toEqual([]);
    const htmlEvent = events.find(
      (e) => e.type === "file.write.done" && e.data.fileType === "html"
    ) as FileWriteDoneEvent | undefined;
    expect(htmlEvent, "expected an html file.write.done event").toBeDefined();
  });

  it("leaves no pure-css placeholder chunks in the server dist", async () => {
    const serverDir = resolve(testDir, "dist/server");
    const names: string[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else names.push(entry.name);
      }
    };
    await walk(serverDir);
    expect(names.filter((n) => /^(globalStyles|flag-icons)/.test(n))).toEqual(
      []
    );
  });
});
