import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "path";
import { mkdir, writeFile } from "fs/promises";
import { setupIndexHTML } from "../setup.js";
import { getSharedBuild, SharedBuildResult } from "./shared-build.js";
import { inlineImportIds } from "../rsc-stream.js";

/**
 * A dependency that ships a `"use client"` module but is not a client
 * package: no react peerDependency, not listed in `clientPackages`. The app
 * inlines it into the server bundle with `ssr.noExternal`, so the transform
 * sees its source.
 *
 * The default `vendorPattern` skips dependency modules, but only the ones
 * without a directive. This module must still become a client reference in
 * the server build; executing it under `react-server` instead would throw on
 * `useState`. A first-party client module imports it too, which is what hosts
 * its chunk in the client build for the html-worker to resolve.
 */
describe("Dependency with a directive, inlined by noExternal, not a client package", () => {
  let buildResult: SharedBuildResult;

  beforeAll(async () => {
    buildResult = await getSharedBuild(
      "vendor-directive-noexternal",
      "vendor-directive-noexternal",
      {
        setupProject: async (testDir: string) => {
          await setupIndexHTML(testDir);
          await mkdir(resolve(testDir, "src/page"), { recursive: true });
          await mkdir(resolve(testDir, "src/components"), { recursive: true });

          const plain = resolve(testDir, "node_modules", "plain-dep");
          await mkdir(plain, { recursive: true });
          await writeFile(
            resolve(plain, "package.json"),
            JSON.stringify({
              name: "plain-dep",
              version: "1.0.0",
              type: "module",
              main: "index.js",
              exports: { ".": "./index.js" },
            })
          );
          await writeFile(
            resolve(plain, "index.js"),
            `"use client";
import React from "react";

export function Counter({ label }) {
  const [count, setCount] = React.useState(0);
  return React.createElement(
    "button",
    { "data-testid": "counter", onClick: () => setCount(count + 1) },
    label,
    " ",
    count
  );
}
`
          );

          await writeFile(
            resolve(testDir, "src/components/Toolbar.client.tsx"),
            `"use client";
import React from "react";
import { Counter } from "plain-dep";

export function Toolbar() {
  return <Counter label="toolbar" />;
}
`
          );

          await writeFile(
            resolve(testDir, "src/page/page.tsx"),
            `import React from "react";
import { Counter } from "plain-dep";
import { Toolbar } from "../components/Toolbar.client.js";

export function Page() {
  return (
    <div>
      <h1>Vendor Directive Test</h1>
      <Toolbar />
      <Counter label="press" />
    </div>
  );
}
`
          );

          await writeFile(
            resolve(testDir, "src/page/props.ts"),
            `export const props = (url: string) => ({ url });`
          );
        },
        pages: ["/"],
        panicThreshold: "all_errors",
        verbose: false,
        clientPackages: [],
        siblingPlugins: [
          {
            name: "test:inline-plain-dep",
            // Ahead of vprs's own `pre` config hook, which reads
            // `ssr.noExternal` and mirrors it into the ssr and server
            // environments.
            enforce: "pre",
            config: () => ({ ssr: { noExternal: [/plain-dep/] } }),
          },
        ],
      }
    );
  }, 30000);

  it("builds without executing the dependency under react-server", () => {
    const routeErrors = buildResult.events.filter(
      (e: any) => e.type === "route.error"
    );
    expect(routeErrors).toHaveLength(0);
  });

  it("serializes the dependency's component as a hosted client reference", () => {
    const rscContent = inlineImportIds(
      buildResult
        .rscFiles()
        .map(([, content]) => content)
        .join("\n")
    );
    expect(rscContent).toContain('I["/node_modules/plain-dep/index.js","Counter"]');
  });

  it("prerenders both usages of the component", () => {
    const htmlFiles = buildResult.htmlFiles();
    expect(htmlFiles.length).toBeGreaterThan(0);
    const html = htmlFiles[0][1];
    expect(html).toContain("Vendor Directive Test");
    expect(html.match(/data-testid="counter"/g)).toHaveLength(2);
  });
});
