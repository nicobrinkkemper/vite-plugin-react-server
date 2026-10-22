/**
 * Dev regression for client-imported server functions (the 2.3.1 fix).
 *
 * A "use client" component that imports a "use server" module directly must work
 * in the DEV server, in BOTH paradigms:
 *   - dev:ssr  (client-first)  — NODE_OPTIONS without the react-server condition
 *   - dev:rsc  (server-first)  — NODE_OPTIONS with --conditions react-server
 *
 * The 2.3.0 bug: the emitted createServerReference proxy's transport import
 * reached the browser as a bare specifier ("react-server-dom-esm/client.browser"
 * was not remapped), so the page errored. The fix redirects the client-side
 * import to a virtual client module that Vite import-analyzes, so the transport
 * resolves to a dev URL. Prod (Rollup-bundled) always worked.
 *
 * Drives the e2e-owned ServerFnProbe (installed via clientFixtures) on `/`.
 * The probe imports getFavorites ("use server") directly and calls it on click.
 */
import { test, expect } from "@playwright/test";
import { type ChildProcess } from "node:child_process";
import { resolveBidoofDir } from "./bidoofDir.js";
import {
  installClientFixtures,
  uninstallClientFixtures,
  type ClientFixtureHandle,
} from "./clientFixtures.js";
import { spawnViteDev, stopViteDev, waitForServer } from "./devServer.js";

const bidoofDir = resolveBidoofDir();

const MODES = [
  { label: "dev:ssr (client-first)", condition: "", basePort: 33000 },
  { label: "dev:rsc (server-first)", condition: "--conditions react-server", basePort: 34000 },
];

for (const mode of MODES) {
  test.describe(`client-imported server function — ${mode.label}`, () => {
    const PORT = mode.basePort + Math.floor(Math.random() * 1000);
    const BASE_URL = `http://localhost:${PORT}`;
    let server: ChildProcess | undefined;
    let fixtures: ClientFixtureHandle | undefined;

    test.beforeAll(async () => {
      fixtures = await installClientFixtures(bidoofDir);
      server = spawnViteDev({
        dir: bidoofDir,
        port: PORT,
        env: {
          NODE_OPTIONS: mode.condition,
          NODE_ENV: "development",
          BASE_URL: "/",
          PUBLIC_ORIGIN: BASE_URL,
          FORCE_COLOR: "1",
        },
      });
      server.stdout?.on("data", (d) => process.stdout.write(`[${mode.label}] ${d}`));
      server.stderr?.on("data", (d) => process.stderr.write(`[${mode.label}] ${d}`));
      await waitForServer(BASE_URL, 60_000);
    }, 90_000);

    test.afterAll(async () => {
      await stopViteDev(server);
      await uninstallClientFixtures(fixtures);
    });

    test("imports a server function directly and calls it (no bare-specifier error)", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(`${BASE_URL}/`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000); // let the client hydrate

      // ServerFnProbe imports getFavorites ("use server") directly; the click
      // calls it. If the transport import were bare, the module would fail to
      // load and the button would never hydrate/update.
      const probe = page.getByTestId("server-fn-probe");
      await expect(probe).toHaveText("Probe server fn");
      await probe.click();
      await expect(probe).toHaveText(/server says: \d+ favorites/);

      // No "bare specifier ... was not remapped" (or any) errors.
      expect(errors.join("\n")).not.toMatch(/bare specifier|not remapped/i);
      expect(errors).toEqual([]);
    });
  });
}
