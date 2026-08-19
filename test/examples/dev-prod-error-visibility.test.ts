import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile, rm, readFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Regression test for the maintainer's intent behind dev-mode static builds
 * (`NODE_ENV=development vite build`): a development build must SURFACE the
 * React errors/warnings that a production build MINIFIES away — and the SSG
 * prerender must still COMPLETE so the page HTML + RSC are emitted.
 *
 * Process isolation (the load-bearing part)
 * -----------------------------------------
 * Each mode is built in its OWN child process with `NODE_ENV` pinned from
 * process start (`vite build` spawned via child_process). The previous version
 * mutated `process.env.NODE_ENV` mid-process and built both modes in one
 * process; that desynced the require/module cache of the vendored React
 * renderer vs. jsx-runtime and tripped a panic
 * (`Cannot set properties of undefined (setting 'validated')`) during the SSG
 * prerender. With NODE_ENV fixed before the process starts, the vendored
 * renderer and jsx-runtime resolve consistently, so the dev build's SSG
 * COMPLETES and streams from moduleBase (source).
 *
 * What is asserted, off the SAME fixture, per spawned process:
 *   - PRODUCTION build → MINIFIED React: the static client bundle contains
 *     React's minified-error redirect ("Minified React error" /
 *     `react.dev/errors`) and NOT readable warning sentences; SSG succeeds
 *     (the page HTML + an RSC payload are emitted).
 *   - DEVELOPMENT build → NON-MINIFIED React: readable React warning text is
 *     present, the minified-error redirect is absent; SSG ALSO succeeds.
 *
 * The fixture is built with esbuild's automatic JSX runtime so the dev build
 * also exercises the jsxDev fix: without it, esbuild's dev JSX transform emits
 * a trailing `module` self-arg into the pure-ESM server bundle and the SSG
 * prerender throws `ReferenceError: module is not defined`. A completing dev
 * SSG here is therefore also a guard against that regression.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(__dirname, "../fixtures/dev-prod-error-visibility");
const VITE_BIN = resolve(__dirname, "../../node_modules/.bin/vite");

async function setupFixture(dir: string) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(resolve(dir, "src/page"), { recursive: true });
  await mkdir(resolve(dir, "src/components"), { recursive: true });
  await writeFile(
    resolve(dir, "index.html"),
    `<!DOCTYPE html><html><head><title>T</title></head><body><div id="root"></div><script type="module" src="/src/client.tsx"></script></body></html>`
  );
  await writeFile(
    resolve(dir, "src/client.tsx"),
    `import React from "react";\nimport { createRoot } from "react-dom/client";\ncreateRoot(document.getElementById("root")!).render(<div>Client App</div>);\n`
  );
  await writeFile(
    resolve(dir, "src/components/Counter.client.tsx"),
    `"use client";\nimport React from "react";\nconst { useState } = React;\nexport function Counter({ start = 0 }: { start?: number }) {\n  const [count, setCount] = useState(start);\n  return <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>;\n}\n`
  );
  await writeFile(
    resolve(dir, "src/page/page.tsx"),
    `import React from "react";\nimport { Counter } from "../components/Counter.client.js";\nexport function Page(props: any) {\n  return (\n    <div>\n      <h1>Error Visibility</h1>\n      <Counter start={props.start ?? 0} />\n    </div>\n  );\n}\n`
  );
  await writeFile(
    resolve(dir, "src/page/props.ts"),
    `export const props = (url: string) => ({ start: 5, url });`
  );
  // A real vite.config the spawned `vite build` will load. Each spawn passes
  // its own `--outDir` per-mode via the build option, so dev and prod don't
  // clobber each other. We force the automatic JSX runtime so the dev build
  // exercises the jsxDev `module` self-arg fix.
  await writeFile(
    resolve(dir, "vite.config.ts"),
    `import { defineConfig } from "vite";\n` +
      `import { vitePluginReactServer } from "vite-plugin-react-server";\n` +
      `const outDir = process.env.VPRS_TEST_OUTDIR || "dist";\n` +
      `export default defineConfig({\n` +
      `  root: __dirname,\n` +
      `  esbuild: { jsx: "automatic" },\n` +
      `  optimizeDeps: { include: ["react-server-dom-esm/client.browser"] },\n` +
      `  plugins: vitePluginReactServer({\n` +
      `    runner: "main",\n` +
      `    moduleBase: "src",\n` +
      `    Page: "src/page/page.tsx",\n` +
      `    props: "src/page/props.ts",\n` +
      `    moduleBasePath: "",\n` +
      `    moduleBaseURL: "/",\n` +
      `    verbose: false,\n` +
      `    projectRoot: __dirname,\n` +
      `    build: { pages: ["/"], assetsDir: "assets", client: "client", server: "server", static: "static", outDir },\n` +
      `    css: { inlineCss: false },\n` +
      `  }),\n` +
      `});\n`
  );
}

interface ModeBuildResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Concatenated code of every emitted chunk under <outDir>/static (client, bundles React). */
  staticCode: string;
  /** Concatenated text of every emitted chunk under <outDir>/server (pure-ESM server bundle). */
  serverCode: string;
  /** index.html emitted by the SSG prerender (empty string if none). */
  pageHtml: string;
  /** Whether any *.rsc / RSC payload artifact was emitted by the prerender. */
  hasRscArtifact: boolean;
}

async function readAllFiles(dir: string): Promise<{ name: string; code: string }[]> {
  const out: { name: string; code: string }[] = [];
  let entries: string[] = [];
  try {
    entries = await readdir(dir, { recursive: true } as any);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = resolve(dir, name);
    try {
      const code = await readFile(full, "utf8");
      out.push({ name, code });
    } catch {
      // directory entry — skip
    }
  }
  return out;
}

/**
 * Build the fixture once in a given mode, in a dedicated child process with
 * NODE_ENV pinned from process start. We pass NODE_ENV but NO `--mode`: with
 * the single-source-of-truth fix, vprs mirrors NODE_ENV when no explicit mode
 * is set, so `NODE_ENV=development vite build` yields a dev build.
 */
async function buildInMode(mode: "development" | "production"): Promise<ModeBuildResult> {
  const outDir = `dist-${mode}`;
  const proc = spawnSync(VITE_BIN, ["build"], {
    cwd: FIXTURE_ROOT,
    encoding: "utf8",
    timeout: 120000,
    env: {
      ...process.env,
      NODE_ENV: mode,
      NODE_OPTIONS: "--conditions react-server",
      VPRS_TEST_OUTDIR: outDir,
    },
  });

  const outRoot = resolve(FIXTURE_ROOT, outDir);
  const staticFiles = await readAllFiles(resolve(outRoot, "static"));
  const serverFiles = await readAllFiles(resolve(outRoot, "server"));

  const staticCode = staticFiles
    .filter((f) => f.name.endsWith(".js") || f.name.endsWith(".mjs"))
    .map((f) => f.code)
    .join("\n");
  const serverCode = serverFiles
    .filter((f) => f.name.endsWith(".js") || f.name.endsWith(".mjs"))
    .map((f) => f.code)
    .join("\n");

  // The SSG prerender writes the page HTML into the static output tree.
  const htmlEntry = staticFiles.find((f) => f.name.endsWith("index.html"));
  const pageHtml = htmlEntry?.code ?? "";
  const hasRscArtifact = [...staticFiles, ...serverFiles].some(
    (f) => /\.rsc$/.test(f.name) || /\.rsc\.|rsc-payload|x-component/i.test(f.code)
  );

  return {
    status: proc.status,
    stdout: proc.stdout ?? "",
    stderr: proc.stderr ?? "",
    staticCode,
    serverCode,
    pageHtml,
    hasRscArtifact,
  };
}

describe("dev-vs-prod static build error visibility", () => {
  let dev: ModeBuildResult;
  let prod: ModeBuildResult;

  beforeAll(async () => {
    await setupFixture(FIXTURE_ROOT);
    // Each build is a fully isolated child process; order is not significant.
    prod = await buildInMode("production");
    dev = await buildInMode("development");
  }, 300000);

  afterAll(async () => {
    await rm(FIXTURE_ROOT, { recursive: true, force: true });
  });

  it("both builds exit successfully (SSG prerender completes in each process)", () => {
    expect(prod.status, `prod build failed:\n${prod.stderr}`).toBe(0);
    expect(dev.status, `dev build failed:\n${dev.stderr}`).toBe(0);
  });

  it("both builds emit a static client bundle", () => {
    expect(prod.staticCode.length).toBeGreaterThan(0);
    expect(dev.staticCode.length).toBeGreaterThan(0);
  });

  it("the SSG prerender succeeds in BOTH modes (page HTML emitted)", () => {
    // A completing dev SSG also proves the jsxDev `module` self-arg fix (the
    // dev JSX transform's self-arg would otherwise throw `module is not
    // defined` in the pure-ESM server bundle during prerender) and that
    // process isolation avoided the require-cache `validated` panic.
    expect(prod.pageHtml).toContain("Error Visibility");
    expect(dev.pageHtml).toContain("Error Visibility");
  });

  it("the DEVELOPMENT server bundle uses the production JSX transform (jsxDev `module` self-arg fix)", () => {
    // With the fix, even a development build emits the PRODUCTION JSX call
    // shape in the pure-ESM server bundle: `jsx`/`jsxs` from react/jsx-runtime,
    // and no `jsxDEV` / `jsx-dev-runtime` / trailing-`module` self-arg.
    expect(dev.serverCode.length).toBeGreaterThan(0);
    expect(dev.serverCode).not.toContain("jsxDEV");
    expect(dev.serverCode).not.toContain("jsx-dev-runtime");
    expect(dev.serverCode).toContain("react/jsx-runtime");
    expect(dev.serverCode).not.toMatch(/jsxDEV\([^)]*\bmodule\b/);
  });

  it("PRODUCTION bundle uses MINIFIED React (errors hidden)", () => {
    // React's prod build replaces invariant messages with a redirect to
    // react.dev/errors#<code> ("Minified React error") — the hallmark of
    // minified React.
    expect(prod.staticCode).toContain("react.dev/errors");
    expect(prod.staticCode).toContain("Minified React error");

    // The readable dev-only warning/error sentences that production strips
    // out must NOT be present.
    expect(prod.staticCode).not.toContain("Maximum update depth exceeded");
    expect(prod.staticCode).not.toContain("Each child in a list");
  });

  it("DEVELOPMENT bundle uses NON-MINIFIED React (errors shown)", () => {
    // The minified-error redirect must be ABSENT in the dev build.
    expect(dev.staticCode).not.toContain("react.dev/errors");
    expect(dev.staticCode).not.toContain("Minified React error");

    // ...and readable React warning/error text that production hides must be
    // PRESENT. Match on several stable React dev-build sentences.
    const hasReadableDevText =
      dev.staticCode.includes("Maximum update depth exceeded") &&
      dev.staticCode.includes("Each child in a list") &&
      dev.staticCode.includes("Warning:");
    expect(hasReadableDevText).toBe(true);
  });
});
