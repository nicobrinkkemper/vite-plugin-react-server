import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { mkdir, writeFile } from "fs/promises";
import { setupIndexHTML } from "../setup.js";
import { getSharedBuild } from "./shared-build.js";
import { inlineImportIds } from "../rsc-stream.js";

/**
 * A client package that only server components import: no first-party client
 * module pulls it into the client graph. The client build hosts its
 * `"use client"` modules because server code imports the package.
 *
 * One build per file: a second build in the same process, under the
 * `react-server` condition, renders the first build's page module.
 */
const component = (name: string) => `"use client";
import React from "react";

export function ${name}({ label }) {
  const [count, setCount] = React.useState(0);
  return React.createElement("button", { onClick: () => setCount(count + 1) }, label, " ", count);
}
`;

const manifest = (name: string) =>
  JSON.stringify({
    name,
    version: "1.0.0",
    type: "module",
    sideEffects: false,
    exports: { ".": "./index.js" },
    peerDependencies: { react: "*" },
  });

describe("Client packages only server components import", () => {
  it("hosts their directive modules in the browser build", async () => {
    const result = await getSharedBuild(
      "client-package-server-only-import",
      "client-package-server-only-import",
      {
        setupProject: async (testDir: string) => {
          await setupIndexHTML(testDir);
          await mkdir(resolve(testDir, "src/page"), { recursive: true });

          // The directive sits on the package's entry.
          const badge = resolve(testDir, "node_modules", "fake-badge");
          await mkdir(badge, { recursive: true });
          await writeFile(resolve(badge, "package.json"), manifest("fake-badge"));
          await writeFile(resolve(badge, "index.js"), component("Badge"));

          // The shape UI libraries publish: an index without a directive
          // that re-exports modules which each carry their own.
          const ui = resolve(testDir, "node_modules", "fake-ui");
          await mkdir(resolve(ui, "components"), { recursive: true });
          await writeFile(resolve(ui, "package.json"), manifest("fake-ui"));
          await writeFile(resolve(ui, "index.js"), `export * from "./components/index.js";\n`);
          await writeFile(
            resolve(ui, "components/index.js"),
            `export { FancyButton } from "./button.js";\nexport { FancyCard } from "./card.js";\n`
          );
          await writeFile(resolve(ui, "components/button.js"), component("FancyButton"));
          await writeFile(resolve(ui, "components/card.js"), component("FancyCard"));

          await writeFile(
            resolve(testDir, "src/page/page.tsx"),
            `import React from "react";
import { Badge } from "fake-badge";
import { FancyButton } from "fake-ui";

export function Page() {
  return (
    <div>
      <h1>Server Only Import Test</h1>
      <Badge label="badge" />
      <FancyButton label="press" />
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
        clientPackages: ["fake-badge", "fake-ui"],
      }
    );
    expect(result.htmlFiles()[0][1]).toContain("Server Only Import Test");

    const rscContent = inlineImportIds(
      result.rscFiles().map(([, content]) => content).join("\n")
    );
    const browserFiles = result.staticChunks().map(([file]) => file);
    for (const [chunk, name] of [
      ["fake-badge", "Badge"],
      ["button", "FancyButton"],
    ]) {
      const id = rscContent.match(
        new RegExp(`I\\["(/assets/${chunk}-[\\w-]+\\.js)","${name}"\\]`)
      )?.[1];
      expect(id, name).toBeDefined();
      expect(browserFiles.some((file) => file.endsWith(id!.slice(1))), name).toBe(true);
    }
    // The page does not import the card, so it is not hosted.
    expect(browserFiles.some((file) => /assets\/card-[\w-]+\.js$/.test(file))).toBe(false);
  }, 30000);
});
