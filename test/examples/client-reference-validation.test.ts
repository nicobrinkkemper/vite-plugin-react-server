import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { setupTestProject } from "../setup.js";
import { doBuild } from "../doBuild.js";

const SOURCE = "src/components/Link.client.tsx";

/** Runs once the browser build has written its manifest and files. */
function afterBrowserBuild(run: (manifestPath: string) => Promise<void>): Plugin {
  return {
    name: "test:after-browser-build",
    async closeBundle() {
      if (this.environment.name !== "client") return;
      await run(join(this.environment.config.root, "dist/static/.vite/manifest.json"));
    },
  };
}

describe("client references are checked against the browser build", () => {
  let root: string;
  beforeAll(async () => {
    const fixtures = join(import.meta.dirname, "../fixtures");
    await mkdir(fixtures, { recursive: true });
    root = await mkdtemp(join(fixtures, "client-reference-validation-"));
    await setupTestProject(root);
    // Server code that imports the Link client component. No page is
    // prerendered, so the check is the only thing that can fail the build.
    await writeFile(
      join(root, "src/nav.server.tsx"),
      `import { Link } from "./components/Link.client.js";\nexport const nav = () => Link;\n`
    );
  });
  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  const build = (plugin: Plugin) =>
    doBuild({ projectRoot: root, build: { pages: [], edge: false } }, [plugin]);

  const removeBrowserFile = afterBrowserBuild(async (manifestPath) => {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await rm(join(root, "dist/static", manifest[SOURCE].file));
  });

  const dropManifestEntry = afterBrowserBuild(async (manifestPath) => {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    delete manifest[SOURCE];
    await writeFile(manifestPath, JSON.stringify(manifest));
  });

  it("passes when the browser build wrote every referenced file", async () => {
    let file = "";
    await build(afterBrowserBuild(async (manifestPath) => {
      file = JSON.parse(await readFile(manifestPath, "utf8"))[SOURCE].file;
    }));
    expect(file).toMatch(/Link\.client-[\w-]+\.js$/);
    expect(existsSync(join(root, "dist/static", file))).toBe(true);
  });

  it("fails when a referenced file is gone from the browser output", async () => {
    await expect(build(removeBrowserFile)).rejects.toThrow(
      /src\/components\/Link\.client\.tsx is referenced as \/\S*Link\.client-[\w-]+\.js, but dist\/static\/\S*Link\.client-[\w-]+\.js does not exist: dist\/static\/\.vite\/manifest\.json lists that file, but it is not on disk\./
    );
  });

  it("fails when the browser manifest has no entry for a referenced module", async () => {
    await expect(build(dropManifestEntry)).rejects.toThrow(
      /src\/components\/Link\.client\.tsx is referenced as \S+, but dist\/static\/\S+ does not exist: dist\/static\/\.vite\/manifest\.json has no entry for it\./
    );
  });
});
