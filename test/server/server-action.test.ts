import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestServerActionJS } from "../setup.js";
import { doBuild } from "../server/doBuild.js";
import { testUserOptions } from "../test-config.js";
import { readdir, readFile, mkdir, rm } from "fs/promises";
import { resolve, join } from "path";

const testDir = resolve(__dirname, "../fixtures/server-action.test");
describe("Generic Server Action Build Output", () => {
  let events: any[];
  let serverActionFiles: string[];
  let distDir: string;

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await setupTestServerActionJS(testDir);

    // Run build once
    try {
      events = await doBuild({
        ...testUserOptions,
        projectRoot: testDir,
        Page: "src/page/page.tsx",
        build: {
          pages: ["/"],
        },
      });

      // Get server action files recursively
      distDir = resolve(testDir, "dist");
      const getAllFiles = async (dir: string): Promise<string[]> => {
        const files = await readdir(dir, { withFileTypes: true });
        const paths = await Promise.all(
          files.map(async (file) => {
            const path = join(dir, file.name);
            if (file.isDirectory()) {
              return getAllFiles(path);
            }
            return path;
          })
        );
        return paths.flat();
      };

      const allFiles = await getAllFiles(distDir);
      serverActionFiles = allFiles.filter(
        (f) => f.includes("server") && !f.endsWith(".map")
      );
    } catch (error) {
      console.trace(error);
      throw error;
    }
  });

  afterAll(async () => {
    // await rm(testDir, { recursive: true, force: true });
  });

  it("should output at least one server action file", () => {
    expect(serverActionFiles.length).toBeGreaterThan(0);
  });

  it("should register the add server action", async () => {
    let found = false;
    for (const file of serverActionFiles) {
      const content = await readFile(file, "utf-8");
      if (
        content.includes("registerServerReference") &&
        content.includes("add") &&
        content.includes("return a + b")
      ) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
