import { describe, it, beforeAll } from "vitest";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setupTestProject } from "../setup.js";
import { getSharedBuild, type SharedBuildResult } from "./shared-build.js";

// PROBE (bd 2olq): a "use client" component importing env helpers from
// vite-plugin-react-server/utils. The claim: its /utils import resolves while
// the module is processed as a client reference (react-server/static env), so
// the browser bundle carries env.node (process.env reads) instead of
// env.browser (import.meta.env replacements). Assertions state the FIXED
// behavior — a failure confirms the bug.

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

describe("probe 2olq: use-client /utils import env variant", () => {
  let build: SharedBuildResult;
  beforeAll(async () => {
    build = await getSharedBuild("env-probe-2olq", "env-probe-2olq", {
      setupProject: setupEnvProbeProject,
      pages: ["/"],
      build: { outDir: "dist-env-probe-2olq" },
    });
  });

  // `it.fails`: the bug is CONFIRMED and unfixed — the hosted client chunk is
  // bundled from env.node.js (see its rolldown region header), whose process
  // read the consumer define turns into `{}`, so browsers silently get the
  // fallbacks (BASE_URL "/", PUBLIC_ORIGIN ""). Flip to `it` when the
  // client-reference hosting path resolves #env under the browser condition.
  it.fails("browser-facing chunks use the browser env variant (no process.env VITE_ reads)", () => {
    const browserChunks = [...build.clientChunks(), ...build.staticChunks()];
    const envChunks = browserChunks.filter(([, code]) =>
      code.includes("PUBLIC_ORIGIN")
    );
    console.log(
      "[probe] env-bearing browser chunks:",
      envChunks.map(([f]) => f)
    );
    for (const [file, code] of envChunks) {
      console.log(
        `[probe] ${file}: VITE_PUBLIC_ORIGIN=${code.includes(
          "VITE_PUBLIC_ORIGIN"
        )} process.env=${code.includes("process.env")}`
      );
    }
    const offending = envChunks.filter(
      ([, code]) =>
        code.includes("VITE_PUBLIC_ORIGIN") || code.includes("process.env")
    );
    if (offending.length) {
      throw new Error(
        "node env variant reached browser chunks: " +
          offending.map(([f]) => f).join(", ")
      );
    }
    if (envChunks.length === 0) {
      throw new Error(
        "probe inconclusive: no browser chunk carries PUBLIC_ORIGIN at all"
      );
    }
  });
});
