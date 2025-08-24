import { resolve } from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestProject } from "../setup.js";
import { getCondition } from "vite-plugin-react-server/config";
import { doBuild } from "../doBuild.js";
import { readFile } from "fs/promises";

describe("setup test", () => {
  const testDir = resolve(__dirname, `../fixtures/examples/${getCondition()}/setup.test`);

  beforeAll(async () => {
    try {
      await setupTestProject(testDir);
      await doBuild({
        projectRoot: testDir,
        verbose: false,
        build: {
          // out of scope for this setup test
          pages: [],
        },
      });
    } catch (error) {
      console.error("Failed to setup test project:", error);
    }
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  it("should have a test project structure", async () => {

    // Check that required files exist
    const pageContent = await readFile(
      resolve(testDir, "src/page/page.tsx"),
      "utf-8"
    );
    const propsContent = await readFile(
      resolve(testDir, "src/page/props.ts"),
      "utf-8"
    );

    expect(pageContent).toContain("export function Page");
    expect(propsContent).toContain("export const props");
  });
  
  it("should have a build with index.html", async () => {

    const indexHtml = await readFile(
      resolve(testDir, "dist/static/index.html"),
      "utf-8"
    );

    expect(indexHtml).toContain("<!DOCTYPE html>");
    expect(indexHtml).toContain("<html");
    expect(indexHtml).toContain("<body");
    expect(indexHtml).toContain("</body>");
    expect(indexHtml).toContain("</html>");
  });
});
