import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, createLogger } from "vite";
import type { ViteDevServer, Logger } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setupIndexHTML } from "../setup.js";

/**
 * Regression: configureReactServer.server.ts loaded the page and root modules
 * in try/catch blocks that only logged via logger.warn under verbose=true and
 * never routed through handleError or panicThreshold. When the page module
 * failed to load, PageComponent silently stayed at its React.Fragment default
 * and the route rendered blank with no error surfaced anywhere.
 *
 * Distinct from the render-time error surface in rsc-stream-error-surface:
 * here the *module load itself* fails (bad import). The fix routes the inner
 * page/root catches through handleError({ log: true }) so the failure lands
 * in the dev log even with verbose=false.
 */

const port = 3211;
const testDir = resolve(__dirname, "../fixtures/page-module-load-error.test");

let server: ViteDevServer;
let logger: Logger;
const errorLogs: string[] = [];

describe("Page-module load error surface (no verbose)", () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(resolve(testDir, "src/page"), { recursive: true });
    await setupIndexHTML(testDir);

    // A page module that fails at *module load* time (not render) via an
    // import of a non-existent module. Without the fix, the inner try/catch
    // around loader(pagePath) swallows this under !verbose and the route
    // renders as an empty Fragment.
    await writeFile(
      resolve(testDir, "src/page/page.tsx"),
      `import { thisDoesNotExist } from './intentional-page-module-load-failure-missing-import.js';
export function Page() { return thisDoesNotExist; }
`,
    );
    await writeFile(
      resolve(testDir, "src/page/props.ts"),
      `export const props = (url: string) => ({ url });\n`,
    );

    const base = createLogger("info");
    logger = {
      ...base,
      error: (msg: string, opts?: any) => {
        errorLogs.push(typeof msg === "string" ? msg : String(msg));
        if (opts?.error?.stack) {
          errorLogs.push(String(opts.error.stack));
        }
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
          verbose: false,
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

  it("logs the underlying page-module load failure even when verbose is false", async () => {
    await fetch(`http://localhost:${port}/index.rsc`, {
      headers: { Accept: "text/x-component" },
    });

    const joined = errorLogs.join("\n");
    expect(joined).toMatch(/intentional-page-module-load-failure-missing-import/);
  }, 15000);
});
