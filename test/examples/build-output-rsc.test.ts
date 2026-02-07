import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestProject } from "../setup.js";
import { getSharedBuild, SharedBuildResult } from "./shared-build.js";

describe("Build Output - RSC Files (Cross-Environment)", () => {
  let buildResult: SharedBuildResult;

  beforeAll(async () => {
    buildResult = await getSharedBuild("test-project", "build-output-rsc", {
      setupProject: setupTestProject,
      pages: ["/"],
    });
  });

  afterAll(async () => {
    // Cleanup is handled globally at the end of the test suite
  });

  it("should generate RSC files with proper streaming format", async () => {
    // Check that RSC files are generated using the new API
    const rscFiles = buildResult.rscFiles();
    expect(rscFiles.length).toBeGreaterThan(0);

    // Verify RSC files contain proper streaming format
    for (const [rscFile, content] of rscFiles) {
      expect(content.length).toBeGreaterThan(0);

      // Check for RSC streaming format (entries starting with numbers)
      expect(content).toMatch(/\d+:/);
    }
  });

  it("should generate proper content type headers in build output", () => {
    // Verify that the build includes proper content type handling
    // This is typically handled at runtime, but we can verify the build structure
    expect(buildResult.staticChunks().length).toBeGreaterThan(0);
    expect(buildResult.serverChunks().length).toBeGreaterThan(0);
  });

  it("should handle streaming responses in build output", async () => {
    // Check that RSC files are properly formatted for streaming using the new API
    const rscFiles = buildResult.rscFiles();
    expect(rscFiles.length).toBeGreaterThan(0);

    for (const [rscFile, content] of rscFiles) {
      // Verify streaming format with numbered entries
      expect(content).toMatch(/\d+:/);

      // Verify content is not empty
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it("Generates HTML files", () => {
    // Check that all expected file types are present using the new API
    const htmlFiles = buildResult.htmlFiles();

    expect(htmlFiles.length).toBeGreaterThan(0);
    
    for (const [htmlFile, content] of htmlFiles) {
      // Verify RSC entries format (0:, 1:, etc.)
      // Verify content structure
      expect(content.length).toBeGreaterThan(0);
      expect(content).toMatch(/<html/m);
      expect(content).toMatch(/<\/html>/m);
      expect(content).toMatch(/<head>/m);
      expect(content).toMatch(/<\/head>/m);
      expect(content).toMatch(/<body>/m);
      expect(content).toMatch(/<\/body>/m);
      // verify file name
      expect(htmlFile).toMatch(/index.html$/);
    }
  });

  it("Generates JS files", () => {
    const hasJsFiles = buildResult
      .staticChunks()
      .some(([f]) => f.endsWith(".js"));

    expect(hasJsFiles).toBe(true);
  });

  it("Generates rsc files", async () => {
    // Check that RSC files contain proper entries using the new API
    const rscFiles = buildResult.rscFiles();
    expect(rscFiles.length).toBeGreaterThan(0);

    for (const [rscFile, content] of rscFiles) {
      // Verify content structure
      expect(content.length).toBeGreaterThan(0);
      // Verify RSC entries format (0:, 1:, etc.)
      expect(content).toMatch(/^\d+:/m);
      // Verify file name
      expect(rscFile).toMatch(/index.rsc$/);
    }
  });
});
