#!/usr/bin/env node
// Verify that a PRODUCTION react-server-dom-esm browser client can hydrate a
// DEV-format flight payload — the "development scenario" that arises when the
// React family locks to development during an otherwise-production SSG build
// (see lockReactFamily / #107). A plain `vite build` is production by default,
// so this scenario is only reachable via programmatic builds that import the
// plugin before NODE_ENV settles — but when it happens, the emitted dist holds
// dev-format flight (extra debug rows) while the browser bundle is prod react.
//
// This script reproduces the artifact deterministically and proves it hydrates:
//   1. build bidoof-template's static output with the flight/server pass forced
//      to NODE_ENV=development (dev-format index.rsc) and the static+client
//      passes in production (prod browser react);
//   2. serve the static dist;
//   3. drive Chromium (Playwright) and assert the client component actually
//      hydrates (the Counter increments on click), with zero console/page errors.
//
//   node scripts/verify-dev-flight-hydration.mjs          # dev-flight + prod client
//   node scripts/verify-dev-flight-hydration.mjs --prod   # all-prod control
//
// Uses bidoof-template as the fixture, same as the e2e suite. Exits non-zero on
// any failure so it can gate CI.

import { execSync } from "node:child_process";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "../../bidoof-template");
const STATIC = join(FIXTURE, "dist/static");
const PORT = 4178;
const ORIGIN = `http://localhost:${PORT}`;
const BASE = "/";
const PROD_ONLY = process.argv.includes("--prod");

const env = (extra) => ({
  ...process.env,
  BASE_URL: BASE,
  PUBLIC_ORIGIN: ORIGIN,
  FORCE_COLOR: "1",
  ...extra,
});
const run = (cmd, extra) =>
  execSync(cmd, { cwd: FIXTURE, stdio: "inherit", env: env(extra) });

function build() {
  console.log(`\n[build] fixture: ${FIXTURE}`);
  execSync("rm -rf dist", { cwd: FIXTURE });
  // Static + client passes: production (prod browser react bundle).
  run("npx vite build", { NODE_ENV: "production" });
  run("npx vite build --ssr", { NODE_ENV: "production" });
  // Flight/server pass: dev (dev-format flight) unless --prod control.
  run("npx vite build --ssr", {
    NODE_ENV: PROD_ONLY ? "production" : "development",
    NODE_OPTIONS: "--conditions=react-server",
  });
}

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".rsc": "text/x-component",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function serve() {
  const server = http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const file = normalize(join(STATIC, p));
      if (!file.startsWith(STATIC)) return void res.writeHead(403).end();
      const s = await stat(file).catch(() => null);
      if (!s?.isFile()) return void res.writeHead(404).end("not found");
      res.writeHead(200, {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      });
      res.end(await readFile(file));
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  return new Promise((r) => server.listen(PORT, () => r(server)));
}

async function check() {
  const flight = await readFile(join(STATIC, "index.rsc"), "utf8");
  const devRows = /(^|\n):N[0-9]/.test(flight); // dev debug/timing row marker
  console.log(
    `\n[flight] index.rsc: ${flight.length} bytes, dev-format rows: ${devRows}`,
  );

  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto(`${ORIGIN}${BASE}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const rootFilled = (await page.locator("#root").innerHTML().catch(() => "")).length > 0;

  // The Counter client component is `<button>Click count: N</button>`; if the
  // client hydrated the flight it increments on click, otherwise it's stuck.
  const btn = page.getByRole("button", { name: /Click count:/i }).first();
  let hydrated = false;
  let detail = "counter not found";
  if (await btn.count().catch(() => 0)) {
    const before = await btn.innerText();
    await btn.click();
    await page.waitForTimeout(400);
    const after = await btn.innerText();
    hydrated = before !== after;
    detail = `${before.trim()} -> ${after.trim()}`;
  }

  await browser.close();
  server.close();

  const ok =
    rootFilled && hydrated && consoleErrors.length === 0 && pageErrors.length === 0;
  console.log(`\n[result] mode: ${PROD_ONLY ? "prod-control" : "dev-flight"}`);
  console.log(`  #root filled:   ${rootFilled}`);
  console.log(`  hydrated:       ${hydrated} (${detail})`);
  console.log(`  console errors: ${consoleErrors.length}`);
  console.log(`  page errors:    ${pageErrors.length}`);
  if (!ok) {
    console.error("\n❌ FAILED — dev-format flight did not hydrate cleanly.");
    if (consoleErrors.length) console.error("  console:", consoleErrors.slice(0, 5));
    if (pageErrors.length) console.error("  page:", pageErrors.slice(0, 5));
    process.exit(1);
  }
  console.log("\n✅ PASS — production client hydrated the flight, no errors.");
}

build();
await check();
