import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "path";
import { mkdir, writeFile, readFile, readdir } from "fs/promises";
import { setupTestProject } from "../setup.js";
import type {
  PluginEvent,
  FileWriteDoneEvent,
} from "../../dist/plugin/types.js";
import { doBuild } from "../doBuild.js";

// A server module that pulls a module from OUTSIDE the project root via an
// eager import.meta.glob (the "gitignored local config next to the project"
// pattern). Under rolldown-vite's preserveModules output, the emitted server
// chunks for this shape import Rolldown's shared runtime helper
// (_virtual/_rolldown/runtime.js, e.g. __exportAll) — the build must emit
// that helper into the server outDir it is imported from, or post-build SSG
// dies at import time with ERR_MODULE_NOT_FOUND. The ssr environment emits
// its copy of the same helper; the server environment's output naming must
// pass it through as well.
describe("out-of-root eager glob (rolldown runtime helper emission)", () => {
  const testDir = resolve(
    __dirname,
    "../fixtures/out-of-root-glob-runtime-helper.test"
  );
  const outsideDir = resolve(
    __dirname,
    "../fixtures/out-of-root-glob-runtime-helper-outside"
  );
  let events: PluginEvent[];

  beforeAll(async () => {
    await setupTestProject(testDir);

    // The out-of-root module — a sibling of the project root.
    await mkdir(outsideDir, { recursive: true });
    await writeFile(
      resolve(outsideDir, "profile.ts"),
      `export const profile = { name: "outside", flag: true as const };`
    );

    // Barrel that resolves the out-of-root module through an eager glob and
    // re-exports the result (mirrors a local-config registry).
    await mkdir(resolve(testDir, "src/profile"), { recursive: true });
    await writeFile(
      resolve(testDir, "src/profile/index.ts"),
      `const found = import.meta.glob<{ profile: { name: string } }>(
  "../../../out-of-root-glob-runtime-helper-outside/profile.ts",
  { eager: true }
);
const first = Object.values(found)[0];
export const profile = first ? first.profile : { name: "fallback" };
export * from "./extra.js";
`
    );
    await writeFile(
      resolve(testDir, "src/profile/extra.ts"),
      `export const extra = "extra";`
    );

    // Server props module consumes the barrel so the chain is in the server
    // graph.
    await writeFile(
      resolve(testDir, "src/page/props.ts"),
      `import { profile, extra } from "../profile/index.js";
export const props = (url: string) => ({ url, who: profile.name, extra });
`
    );

    ({ events } = await doBuild({ projectRoot: testDir }));
  }, 120_000);

  it("renders the page (no dangling runtime-helper import at SSG time)", () => {
    const routeErrors = events.filter((e) => e.type === "route.error");
    expect(routeErrors).toEqual([]);
    const htmlEvent = events.find(
      (e) => e.type === "file.write.done" && e.data.fileType === "html"
    ) as FileWriteDoneEvent | undefined;
    expect(htmlEvent, "expected an html file.write.done event").toBeDefined();
  });

  it("emits every runtime helper the server chunks import", async () => {
    const serverDir = resolve(testDir, "dist/server");
    const files: string[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.name.endsWith(".js")) files.push(full);
      }
    };
    await walk(serverDir);
    const dangling: string[] = [];
    for (const file of files) {
      const content = await readFile(file, "utf-8");
      for (const match of content.matchAll(
        /from\s+["']([^"']*_virtual[^"']*)["']/g
      )) {
        const target = resolve(file, "..", match[1]);
        try {
          await readFile(target, "utf-8");
        } catch {
          dangling.push(`${file} -> ${match[1]}`);
        }
      }
    }
    expect(dangling).toEqual([]);
  });
});
