import { describe, it, expect, beforeAll } from "vitest";
import { setupTestProject } from "../setup.js";
import { getSharedBuild } from "./shared-build.js";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// The documented inline-flight script id (see plugin/utils/inlineFlight.ts).
const INLINE_FLIGHT_ID = "vprs-flight";

/**
 * build.inlineFlight, under BOTH module conditions.
 *
 * This file is run once per condition by `test:both` (plain vitest = client,
 * NODE_OPTIONS='--conditions react-server' = server). The whole point of the
 * option is that the plugin runs the inline step itself at the post-SSG point
 * in EITHER mode, so the inlined <script id="vprs-flight"> must appear in every
 * route's index.html regardless of which static plugin (client-static or
 * server-static) did the rendering. A consumer's own closeBundle could not
 * guarantee that — it ran before the deferred write in client-first builds.
 */
async function findIndexHtml(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string) => {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name === "index.html") out.push(full);
    }
  };
  await walk(dir);
  return out;
}

describe("build.inlineFlight (both conditions)", () => {
  let staticDir: string;

  beforeAll(async () => {
    const result = await getSharedBuild("inline-flight", "inline-flight", {
      setupProject: setupTestProject,
      pages: ["/", "/page2"],
      verbose: false,
      // Fixed outDir so we can read the inlined HTML straight off disk (the
      // inline step rewrites files post-write, so it's not in the build events).
      build: { inlineFlight: true, outDir: "dist-inline-flight" },
    });
    staticDir = join(result.testDir, "dist-inline-flight", "static");
  });

  it("inlines the flight payload into every prerendered index.html", async () => {
    // The SSG page writes flush asynchronously after the build promise resolves
    // (the harness drains them in afterAll); a real `vite build` waits for the
    // process to settle, which is why this is reliable in production. Poll until
    // every prerendered index.html carries the inline-flight script, then assert.
    const deadline = Date.now() + 15_000;
    let files: string[] = [];
    let allInlined = false;
    while (Date.now() < deadline) {
      files = await findIndexHtml(staticDir);
      if (files.length > 0) {
        const contents = await Promise.all(files.map((f) => readFile(f, "utf-8")));
        allInlined = contents.every((c) => c.includes(`id="${INLINE_FLIGHT_ID}"`));
        if (allInlined) break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(files.length, "expected at least one prerendered index.html").toBeGreaterThan(0);
    expect(
      allInlined,
      `every prerendered index.html under ${staticDir} should carry the inline-flight <script id="${INLINE_FLIGHT_ID}">`
    ).toBe(true);
  });
});
