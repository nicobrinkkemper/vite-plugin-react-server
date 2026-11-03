// Drives Chromium against `vite` dev in a consumer project built by
// verify-installed-dev-navigation.sh. Usage: node installed-dev-navigation.mjs <dir>
// PORT picks the dev server port (default 5197).
import { spawn } from "node:child_process";
import { join } from "node:path";
import { chromium } from "playwright";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node installed-dev-navigation.mjs <consumer-dir>");
  process.exit(2);
}
const port = Number(process.env.PORT ?? 5197);
const origin = `http://localhost:${port}`;

const server = spawn(
  process.execPath,
  [join(dir, "node_modules/vite/bin/vite.js"), "--port", String(port), "--strictPort"],
  {
    cwd: dir,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_OPTIONS: "", NODE_ENV: "development" },
  }
);
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));
const stopServer = () => {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    // already gone
  }
};
process.on("exit", stopServer);

const fail = (message) => {
  console.error(`✗ ${message}`);
  console.error("--- vite dev log ---\n" + log.slice(-4000));
  process.exit(1);
};

const waitForServer = async () => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) fail(`vite exited with ${server.exitCode}`);
    try {
      const res = await fetch(origin + "/");
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  fail("vite dev did not answer within 60s");
};

await waitForServer();

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const requests = [];
  page.on("request", (r) => requests.push({ type: r.resourceType(), url: r.url() }));

  await page.goto(origin + "/");
  // Hydrated: the package's component rendered inside the first-party provider.
  const value = page.locator("#ctx-value");
  await value.waitFor({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const problems = [];
  const ctx = await value.textContent();
  if (ctx !== "shared") {
    problems.push(`ctx-pkg's CtxValue read "${ctx}" instead of its provider's "shared": the client reference loaded a second copy of the package`);
  }

  const raw = requests
    .map((r) => r.url)
    .filter((u) => /\/node_modules\/(vite-plugin-react-server|ctx-pkg)\//.test(u));
  if (raw.length > 0) {
    problems.push(`the browser loaded raw package files next to the pre-bundle:\n  ${raw.join("\n  ")}`);
  }

  await page.evaluate(() => {
    window.__vprsNavigationMarker = "kept";
  });
  requests.length = 0;
  await page.getByRole("link", { name: "About" }).click();
  await page.locator("h1", { hasText: "About" }).waitFor({ timeout: 15_000 });

  if (!page.url().endsWith("/about")) problems.push(`navigated to ${page.url()}, expected /about`);
  const marker = await page.evaluate(() => window.__vprsNavigationMarker);
  if (marker !== "kept") problems.push("the Link click reloaded the document (window state lost)");
  const documents = requests.filter((r) => r.type === "document");
  if (documents.length > 0) {
    problems.push(`the Link click loaded a document: ${documents.map((r) => r.url).join(", ")}`);
  }
  if (!requests.some((r) => new URL(r.url).pathname === "/about/index.rsc")) {
    problems.push(`the Link click never fetched /about/index.rsc:\n  ${requests.map((r) => r.url).join("\n  ")}`);
  }
  if (errors.length > 0) problems.push(`browser errors:\n  ${errors.join("\n  ")}`);
  if (problems.length > 0) fail(problems.join("\n✗ "));

  console.log(`✓ ${process.env.VPRS_TRANSPORT ?? "esm"}: Link navigated client-side, package context shared`);
} finally {
  await browser.close();
  stopServer();
}
