import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { handleRSCStream, type RSCStreamResponse } from "../rsc-stream.js";

/**
 * Dev must deliver css as <link>, even when the configured inline threshold
 * would inline it in a build. Inline <style> rides the flight as a React
 * hoistable, and React dedupes style hoistables by identity without updating
 * the content of one already inserted — so the HMR refetch after a css edit
 * silently drops the new styles. A <link> is URL-addressable and useRscHmr's
 * cache-bust path updates it in place. Build output is unaffected: snapshots
 * are written once and keep the configured inline behavior.
 */

let server: ViteDevServer;
let port = 3141;
let response: RSCStreamResponse;
const testDir = resolve(__dirname, "../fixtures/inline-css-dev-link.test");

async function setupTestFiles() {
  await mkdir(join(testDir, "src/page"), { recursive: true });
  await writeFile(
    join(testDir, "src/page/styles.module.css"),
    `.tiny { color: rgb(1, 2, 3); }\n`
  );
  await writeFile(
    join(testDir, "src/page/page.tsx"),
    `import React from "react";
import styles from "./styles.module.css";

export const Page = ({ title }: { title: string }) => (
  <div className={styles.tiny}>{title}</div>
);`
  );
  await writeFile(
    join(testDir, "src/page/props.ts"),
    `export const props = (url: string) => ({ title: "Inline CSS Dev", url });`
  );
}

describe("dev css delivery under an inline-eligible threshold", () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    await setupTestFiles();

    const parentNodeModules = resolve(__dirname, "../../node_modules");
    try {
      await symlink(parentNodeModules, join(testDir, "node_modules"), "dir");
    } catch {}

    server = await createServer({
      mode: "test",
      root: testDir,
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          projectRoot: testDir,
          moduleBase: "src",
          Page: "src/page/page.tsx",
          props: "src/page/props.ts",
          // The stylesheet above is a few bytes: any build would INLINE it
          // under this config. Dev must still link it.
          css: { inlineCss: true, inlineThreshold: 10_000 },
        }),
      ],
      server: { port },
      cacheDir: join(process.cwd(), "node_modules", `.vite-test-${port}`),
    });
    await server.listen();
    port = server.config?.server?.port ?? port;
    response = await handleRSCStream(`http://localhost:${port}/index.rsc`);
  });

  afterAll(async () => {
    await server?.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("serves the flight successfully", () => {
    expect(response.ok).toBe(true);
  });

  it("delivers the page css as a stylesheet link, not an inline style", () => {
    // The link entry carries rel/href pointing at the vite-served stylesheet.
    expect(response.result).toMatch(
      /"rel":"stylesheet"[^}]*"href":"[^"]*styles\.module\.css/
    );
    // And no style element carrying the sheet's content as children — that is
    // the hoistable shape React refuses to update on refetch.
    expect(response.result).not.toContain("rgb(1, 2, 3)");
  });
});
