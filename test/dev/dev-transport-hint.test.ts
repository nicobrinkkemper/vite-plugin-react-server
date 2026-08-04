import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions, TEST_TRANSPORT } from "../test-config";
import { setupIndexHTML } from "../setup.js";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";

/**
 * The dev document's flight-transport hint is the observable that proves the
 * VPRS_TEST_TRANSPORT matrix knob actually reaches the dev server — action
 * round-trips look identical in both flavors when the payload carries no
 * client references, so a green suite alone can't distinguish "webpack dev
 * works" from "transport option silently ignored".
 *
 * transport:"webpack" → transformIndexHtml prepends the classic inline
 * `self.__vprsFlightTransport="webpack"` script (the client entry picks its
 * flight client off it). Default esm → no tag, byte-for-byte the plain
 * document. This suite runs in BOTH matrix legs and asserts the flavor it
 * was launched under.
 */

let server: ViteDevServer;
const port = 3137;
const testDir = resolve(__dirname, "../fixtures/dev-transport-hint.test");

describe(`dev document transport hint (${TEST_TRANSPORT})`, () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await setupIndexHTML(testDir);
    await mkdir(join(testDir, "src/page"), { recursive: true });
    await writeFile(
      join(testDir, "src/page/page.tsx"),
      `import React from "react";
export const Page = () => <div>Transport Hint Test</div>;`
    );
    await writeFile(
      join(testDir, "src/page/props.ts"),
      `export const props = () => ({});`
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
          Page: () => `src/page/page.tsx`,
          props: () => `src/page/props.ts`,
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

  it(
    TEST_TRANSPORT === "webpack"
      ? "carries the webpack flight hint in <head>"
      : "stays hint-free on the default esm transport",
    async () => {
      const res = await fetch(`http://localhost:${port}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      if (TEST_TRANSPORT === "webpack") {
        expect(html).toContain('self.__vprsFlightTransport="webpack"');
      } else {
        expect(html).not.toContain("__vprsFlightTransport");
      }
    }
  );
});
