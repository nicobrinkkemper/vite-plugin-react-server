import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { setupTestProject } from "../setup.js";
import { doBuild } from "../doBuild.js";

describe("custom browser manifest filename", () => {
  let root: string;
  beforeAll(async () => {
    const fixtures = join(import.meta.dirname, "../fixtures");
    await mkdir(fixtures, { recursive: true });
    root = await mkdtemp(join(fixtures, "custom-manifest-"));
    await setupTestProject(root);
  });
  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });
  it.each(["custom-manifest.json", "metadata/browser.json"])(
    "uses %s for browser, SSR and server reference agreement",
    async (manifest) => {
      await writeFile(join(root, "vite.config.ts"),
        `export default { build: { manifest: ${JSON.stringify(manifest)} } };`);
      await doBuild({ projectRoot: root, build: { pages: [], edge: false } });
      const readManifest = async (environment: string) => JSON.parse(
        await readFile(join(root, "dist", environment, manifest), "utf8")
      );
      const browser = await readManifest("static");
      const ssr = await readManifest("client");
      const server = await readManifest("server");
      const source = "src/components/Link.client.tsx";
      const file = browser[source].file;
      expect(file).toMatch(/Link\.client-[a-z0-9]+\.js$/);
      expect(ssr[source].file).toBe(file);
      expect(server[source].file).toBe(file);
      const reference = await readFile(join(root, "dist/server", file), "utf8");
      expect(reference).toContain(`/${file}`);
    }
  );
});
