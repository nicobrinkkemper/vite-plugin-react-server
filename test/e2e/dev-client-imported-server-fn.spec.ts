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
 * Drives bidoof-template's ServerFnProbe (a "use client" component that imports
 * getTodos directly and calls it on click). Requires the demo's client-imported
 * server-function probe (vite-plugin-react-server-demo-official#97).
 */
import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bidoofDir = join(__dirname, "../../../bidoof-template");

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

const MODES = [
  { label: "dev:ssr (client-first)", condition: "", basePort: 33000 },
  { label: "dev:rsc (server-first)", condition: "--conditions react-server", basePort: 34000 },
];

for (const mode of MODES) {
  test.describe(`client-imported server function — ${mode.label}`, () => {
    const PORT = mode.basePort + Math.floor(Math.random() * 1000);
    const BASE_URL = `http://localhost:${PORT}`;
    let server: ChildProcess | undefined;

    test.beforeAll(async () => {
      server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
        cwd: bidoofDir,
        shell: true,
        env: {
          ...process.env,
          NODE_OPTIONS: mode.condition,
          NODE_ENV: "development",
          BASE_URL: "/",
          PUBLIC_ORIGIN: BASE_URL,
          FORCE_COLOR: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      server.stdout?.on("data", (d) => process.stdout.write(`[${mode.label}] ${d}`));
      server.stderr?.on("data", (d) => process.stderr.write(`[${mode.label}] ${d}`));
      await waitForServer(BASE_URL, 60_000);
    }, 90_000);

    test.afterAll(async () => {
      if (server && server.exitCode === null && server.signalCode === null) {
        await new Promise<void>((resolve) => {
          server!.once("exit", () => resolve());
          server!.kill("SIGTERM");
          setTimeout(() => {
            if (server && server.exitCode === null && server.signalCode === null) {
              server.kill("SIGKILL");
            }
          }, 2000);
        });
      }
    });

    test("imports a server function directly and calls it (no bare-specifier error)", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(`${BASE_URL}/todos/`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000); // let the client hydrate

      // ServerFnProbe imports getTodos ("use server") directly; the click calls
      // it. If the transport import were bare, the module would fail to load and
      // the button would never hydrate/update.
      const probe = page.getByTestId("server-fn-probe");
      await expect(probe).toHaveText("Probe server fn");
      await probe.click();
      await expect(probe).toHaveText(/server says: \d+ todos/);

      // No "bare specifier ... was not remapped" (or any) errors.
      expect(errors.join("\n")).not.toMatch(/bare specifier|not remapped/i);
      expect(errors).toEqual([]);
    });
  });
}
