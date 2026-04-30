import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, createLogger } from "vite";
import type { ViteDevServer, Logger } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setupIndexHTML } from "../setup.js";

/**
 * Regression for bd-qvz acceptance #2:
 *
 *   "Stream errors are swallowed: by default, an RSC render failure returns
 *    an empty 200. Should emit at least a server-side log + a 5xx (or
 *    text/plain error) when the stream errors before bytes flush. Currently
 *    visible only via `verbose: true`."
 *
 * This test runs the dev server with `verbose: false` (the default) against
 * a page that throws on render. The fix must make the failure visible to
 * BOTH the dev server log AND the HTTP client without flipping verbose.
 *
 * Gated to the react-server condition: under the bare `vitest run` path
 * (test:client / the CLIENT half of test:both), the worker spawned by the
 * client-side dev plugin can't resolve the page under react-server semantics
 * and silently renders an empty Root. That's a separate, pre-existing path
 * — outside the scope of bd-qvz #2 — and would mask this test as a false
 * green. test:server, test:dev, and the SERVER half of test:both all set
 * the condition and exercise the real error path.
 */

const port = 3201;
const testDir = resolve(__dirname, "../fixtures/rsc-stream-error.test");

const hasReactServer = (process.env.NODE_OPTIONS ?? "").includes(
  "--conditions react-server",
);

let server: ViteDevServer;
let logger: Logger;
const errorLogs: string[] = [];

describe.skipIf(!hasReactServer)("RSC stream error surface (no verbose)", () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(resolve(testDir, "src/page"), { recursive: true });
    await setupIndexHTML(testDir);

    // A page that throws synchronously on render. Without the fix this
    // produces an empty 200 and no log.
    await writeFile(
      resolve(testDir, "src/page/page.tsx"),
      `import React from 'react';
export function Page() {
  throw new Error('intentional-render-failure-from-test');
}
`,
    );
    await writeFile(
      resolve(testDir, "src/page/props.ts"),
      `export const props = (url: string) => ({ url });\n`,
    );

    // Capture logs by wrapping vite's logger so we can assert on what reached
    // the dev console.
    const base = createLogger("info");
    logger = {
      ...base,
      error: (msg: string, opts?: any) => {
        errorLogs.push(typeof msg === "string" ? msg : String(msg));
        if (opts?.error?.stack) {
          errorLogs.push(String(opts.error.stack));
        }
        // Don't actually print during tests; we just want to capture.
      },
      warn: (msg: string) => {
        errorLogs.push(`WARN: ${msg}`);
      },
    } as Logger;

    server = await createServer({
      mode: "test",
      root: testDir,
      customLogger: logger,
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          projectRoot: testDir,
          verbose: false, // critical: no verbose
        }),
      ],
      server: { port },
      cacheDir: join(process.cwd(), "node_modules", `.vite-test-${port}`),
    });

    await server.listen();
  }, 20000);

  afterAll(async () => {
    await server?.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("returns a non-200 (or text/plain error body) when the RSC stream fails before flush", async () => {
    const res = await fetch(`http://localhost:${port}/index.rsc`, {
      headers: { Accept: "text/x-component" },
    });
    const body = await res.text();

    // Must NOT be the silent empty-200 case: either the status is 5xx OR
    // the body carries an error payload (text/plain or RSC error frame).
    const isFiveHundred = res.status >= 500 && res.status < 600;
    const looksLikeError =
      body.length > 0 &&
      (/RSC render failed/i.test(body) ||
        /intentional-render-failure-from-test/i.test(body));

    expect(
      isFiveHundred || looksLikeError,
      `expected 5xx or error body, got status=${res.status} body=${JSON.stringify(body.slice(0, 200))}`,
    ).toBe(true);
  }, 15000);

  it("logs the underlying error to the dev server log without verbose=true", async () => {
    // The previous test request already exercised the error path. The fix
    // routes the error through handleError({ log: true }) so it lands on
    // the vite logger.
    const joined = errorLogs.join("\n");
    expect(joined).toMatch(/intentional-render-failure-from-test/);
  });
});
