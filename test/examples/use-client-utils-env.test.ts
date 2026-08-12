import { describe, it, expect, beforeAll } from "vitest";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setupTestProject } from "../setup.js";
import { getSharedBuild, type SharedBuildResult } from "./shared-build.js";

// A "use client" component importing env helpers from
// vite-plugin-react-server/utils must give the BROWSER bundle the browser env
// variant with the consumer's define values baked in — and give the Node-run
// renderer bundle (dist/client) live process.env reads. Two regressions are
// pinned here:
// - vprs's own lib build baking its build-time PROD/SSR into the shipped
//   env.browser artifact (SSR:true in every consumer browser chunk);
// - keepProcessEnv being dropped for the ssr environment, rewriting env.node's
//   `process.env` capture to `{}` so every renderer-side env getter silently
//   fell back (BASE_URL "/").

const setupEnvProbeProject = async (testDir: string) => {
  await setupTestProject(testDir);
  await writeFile(
    resolve(testDir, "src/components/EnvProbe.tsx"),
    `"use client";
import React from 'react'
import { env, pageURL } from "vite-plugin-react-server/utils";
export function EnvProbe() {
  return <div data-base={env.BASE_URL} data-url={pageURL("/probe")}>{env.MODE}</div>;
}
`
  );
  await writeFile(
    resolve(testDir, "src/page/page.tsx"),
    `
import React from 'react'
import { EnvProbe } from '../components/EnvProbe.js'
export function Page(props: any) {
  return (<div><span>Page</span><EnvProbe /></div>)
}
`
  );
};

describe("use-client /utils import: env variant per bundle role", () => {
  let build: SharedBuildResult;
  beforeAll(async () => {
    build = await getSharedBuild("use-client-utils-env", "use-client-utils-env", {
      setupProject: setupEnvProbeProject,
      pages: ["/"],
      build: { outDir: "dist-use-client-utils-env" },
    });
  });

  // Bundle-event naming note: the BROWSER environment is named "client" and
  // fires build.writeBundle.client, so clientChunks() is the browser output
  // (dist/static on disk); the renderer environment is named "ssr" and fires
  // build.writeBundle.static, so staticChunks() is the renderer bundle
  // (dist/client on disk).
  it("browser chunks carry baked env values, not process.env reads", () => {
    const browserChunks = build.clientChunks();
    const envChunks = browserChunks.filter(([, code]) =>
      code.includes("PUBLIC_ORIGIN")
    );
    // The hosted EnvProbe chunk must exist and carry the env object at all —
    // an empty match means the probe component fell out of the build.
    expect(envChunks.length).toBeGreaterThan(0);
    for (const [file, code] of envChunks) {
      // env.node reaching the browser shows up as VITE_-prefixed process.env
      // key reads surviving into the chunk.
      expect(code, `${file} carries node env variant`).not.toContain(
        "VITE_PUBLIC_ORIGIN"
      );
      expect(code, `${file} reads process.env`).not.toContain("process.env");
    }
  });

  it("browser chunks bake SSR:false (vprs's own lib build must not leak in)", () => {
    const offending = build
      .clientChunks()
      .filter(
        ([, code]) => /SSR:\s*(true|!0)/.test(code) && code.includes("PUBLIC_ORIGIN")
      );
    expect(offending.map(([f]) => f)).toEqual([]);
  });

  it("the renderer bundle (dist/client) keeps live process.env reads", () => {
    const envChunks = build
      .staticChunks()
      .filter(([file]) => /utils\/env\.js$/.test(file));
    expect(envChunks.length).toBeGreaterThan(0);
    for (const [file, code] of envChunks) {
      // keepProcessEnv:false rewrites the capture to `{}` — the getters then
      // silently fall back instead of reading the mirrored VITE_ values.
      expect(code, `${file} lost its process.env capture`).toMatch(
        /typeof process !== "undefined" \? process\.env/
      );
    }
  });
});
