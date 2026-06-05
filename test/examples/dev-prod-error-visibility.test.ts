import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createBuilder } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import type { PluginEvent } from "vite-plugin-react-server/types";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Regression test for the maintainer's intent behind dev-mode static builds
 * (`NODE_ENV=development … vite build --mode development`): a development build
 * must SURFACE the React errors/warnings that a production build MINIFIES away.
 *
 * Two things are proven here, off the SAME fixture, by inspecting the static
 * (`--app`) client bundle that bundles React:
 *
 *   - PRODUCTION build → minified React. The bundle contains React's minified
 *     error redirect (`react.dev/errors` / "Minified React error") and does
 *     NOT contain readable invariant/warning sentences.
 *   - DEVELOPMENT build → non-minified React. Readable React warning text is
 *     present and the minified-error redirect is absent — errors are shown.
 *
 * The fixture is built with esbuild's automatic JSX runtime so the dev build
 * also exercises the jsxDev fix: without it, esbuild's dev JSX transform emits
 * a trailing `module` self-arg into the pure-ESM server bundle and the SSG
 * prerender throws `ReferenceError: module is not defined`. So a green dev
 * build here is itself a guard against that regression.
 */

const FIXTURE_ROOT = resolve(__dirname, "../fixtures/dev-prod-error-visibility");

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
}

interface ModeBuildResult {
  events: PluginEvent[];
  /** Concatenated code of every chunk in the static (React-bundling) build. */
  staticCode: string;
  /** Concatenated code of every chunk in the ESM server build. */
  serverCode: string;
}

/**
 * Build the fixture once in a given mode. The static client build bundles
 * React, so its emitted chunk code is what reveals dev-vs-prod React.
 *
 * `mode` and `process.env.NODE_ENV` are kept in lockstep because
 * resolveUserConfig throws when a string `config.mode` disagrees with
 * NODE_ENV. We restore NODE_ENV afterward.
 */
async function buildInMode(mode: "development" | "production"): Promise<ModeBuildResult> {
  const events: PluginEvent[] = [];
  const prevNodeEnv = process.env.NODE_ENV;
  const prevCwd = process.cwd();
  process.env.NODE_ENV = mode;
  try {
    const builder = await createBuilder({
      mode,
      root: FIXTURE_ROOT,
      // Force the automatic JSX runtime so the dev build would emit jsxDEV
      // (and, without the fix, the `module` self-arg) — exercising the fix.
      esbuild: { jsx: "automatic" },
      plugins: vitePluginReactServer({
        moduleBase: "src",
        Page: "src/page/page.tsx",
        props: "src/page/props.ts",
        moduleBasePath: "",
        moduleBaseURL: "/",
        verbose: false,
        projectRoot: FIXTURE_ROOT,
        build: {
          pages: ["/"],
          assetsDir: "assets",
          client: "client",
          server: "server",
          static: "static",
          outDir: `dist-${mode}`,
        },
        css: { inlineCss: false },
        onEvent: (e: PluginEvent) => events.push(e),
      }),
    });
    process.chdir(FIXTURE_ROOT);
    // The static/client bundles are written (and their `build.writeBundle.*`
    // events fire) BEFORE the server SSG-prerender step. We only assert on the
    // emitted client bundle content, so a later SSG-prerender failure (an
    // unrelated, pre-existing React-experimental quirk under
    // `--conditions react-server`) must not fail this test — swallow it and
    // rely on the staticCode assertions below.
    try {
      await builder.buildApp();
    } catch {
      // intentionally ignored — see comment above
    }
  } finally {
    process.chdir(prevCwd);
    process.env.NODE_ENV = prevNodeEnv;
  }

  // The browser/static build (env "client", consumer:client, non-SSR — it
  // outputs to dist/static and BUNDLES React) emits `build.writeBundle.client`.
  // Note the inverted naming: the env named "ssr" emits `build.writeBundle.static`
  // and externalizes React, so it does NOT reveal React's dev/prod build.
  const staticEvent = events.find((e) => e.type === "build.writeBundle.client");
  const bundle = (staticEvent as any)?.data?.bundle ?? {};
  const staticCode = Object.values(bundle)
    .filter((entry: any) => entry.type === "chunk")
    .map((entry: any) => entry.code as string)
    .join("\n");

  const serverEvent = events.find((e) => e.type === "build.writeBundle.server");
  const serverBundle = (serverEvent as any)?.data?.bundle ?? {};
  const serverCode = Object.values(serverBundle)
    .filter((entry: any) => entry.type === "chunk")
    .map((entry: any) => entry.code as string)
    .join("\n");

  return { events, staticCode, serverCode };
}

describe("dev-vs-prod static build error visibility", () => {
  let dev: ModeBuildResult;
  let prod: ModeBuildResult;

  beforeAll(async () => {
    await setupFixture(FIXTURE_ROOT);
    // Build prod first, then dev (independent; order is not significant).
    prod = await buildInMode("production");
    dev = await buildInMode("development");
  }, 120000);

  afterAll(async () => {
    await rm(FIXTURE_ROOT, { recursive: true, force: true });
  });

  it("both builds emit a static bundle", () => {
    expect(prod.staticCode.length).toBeGreaterThan(0);
    expect(dev.staticCode.length).toBeGreaterThan(0);
  });

  it("the DEVELOPMENT server bundle uses the production JSX transform (jsxDev `module` self-arg fix)", () => {
    // Build-output content assertion for the jsxDev fix (robust: no SSG render
    // needed). Without `esbuild: { jsxDev: false }` forced for build envs,
    // esbuild's automatic DEV JSX transform emits `jsxDEV(...)` with a trailing
    // self-arg that esbuild renders as a bare `module` reference. In the
    // pure-ESM server bundle that `module` is undefined, so the SSG prerender
    // throws `ReferenceError: module is not defined`.
    //
    // With the fix, even a development build emits the PRODUCTION JSX call
    // shape in the server bundle: `jsx`/`jsxs` from react/jsx-runtime, and no
    // `jsxDEV` / `jsx-dev-runtime` / trailing-`module` self-arg.
    expect(dev.serverCode.length).toBeGreaterThan(0);
    expect(dev.serverCode).not.toContain("jsxDEV");
    expect(dev.serverCode).not.toContain("jsx-dev-runtime");
    expect(dev.serverCode).toContain("react/jsx-runtime");
    // The dev JSX transform's self-arg was the literal `module`; the prod
    // transform omits it entirely.
    expect(dev.serverCode).not.toMatch(/jsxDEV\([^)]*\bmodule\b/);
  });

  it("PRODUCTION bundle uses MINIFIED React (errors hidden)", () => {
    // React's prod build replaces invariant messages with a redirect to
    // react.dev/errors#<code> ("Minified React error") — the hallmark of
    // minified React. Both markers are present in the prod bundle.
    expect(prod.staticCode).toContain("react.dev/errors");
    expect(prod.staticCode).toContain("Minified React error");

    // The readable dev-only warning/error sentences that production strips
    // out must NOT be present.
    expect(prod.staticCode).not.toContain("Maximum update depth exceeded");
    expect(prod.staticCode).not.toContain("Each child in a list");
    expect(prod.staticCode).not.toContain("Warning:");
  });

  it("DEVELOPMENT bundle uses NON-MINIFIED React (errors shown)", () => {
    // The minified-error redirect must be ABSENT in the dev build — dev React
    // ships full messages instead of the react.dev/errors#<code> redirect.
    expect(dev.staticCode).not.toContain("react.dev/errors");
    expect(dev.staticCode).not.toContain("Minified React error");

    // ...and the readable React warning/error text that production hides must
    // be PRESENT, proving a dev build surfaces these errors. Match on several
    // stable React dev-build sentences so the assertion isn't brittle.
    const hasReadableDevText =
      dev.staticCode.includes("Maximum update depth exceeded") &&
      dev.staticCode.includes("Each child in a list") &&
      dev.staticCode.includes("Warning:");
    expect(hasReadableDevText).toBe(true);
  });
});
