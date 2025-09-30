import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTodoTestProject } from "../setup.js";
import {
  getSharedBuild,
  cleanupSharedBuilds,
  SharedBuildResult,
} from "./shared-build.js";

describe("Server Action Integration (Cross-Environment)", () => {
  let buildResult: SharedBuildResult;

  beforeAll(async () => {
    buildResult = await getSharedBuild(
      "todo-test-project",
      "server-action-integration",
      {
        setupProject: setupTodoTestProject,
        pages: ["/todos"],
      }
    );
  });

  afterAll(async () => {
    // Cleanup is handled globally at the end of the test suite
  });

  it("should include server action references in RSC files", async () => {
    // Find RSC files and check for server action references
    const rscFiles = buildResult.rscFiles();
    expect(rscFiles.length).toBeGreaterThan(0);

    let foundServerActions = false;
    for (const [, code] of rscFiles) {
      if (
        code.includes("addTodo") ||
        code.includes("toggleTodo") ||
        code.includes("deleteTodo")
      ) {
        foundServerActions = true;
        break;
      }
    }
    expect(foundServerActions).toBe(true);
  });

  it("should generate server action files in server build", () => {
    // Verify server actions are included in server build
    const serverActionFiles = buildResult
      .serverChunks()
      .filter(
        ([f]) => f.includes("actions.server") || f.includes("server-actions")
      );
    expect(serverActionFiles.length).toBeGreaterThan(0);
  });

  it("should NOT include server actions in static build", () => {
    // Verify server actions are NOT included in static build
    const serverActionFilesInStatic = buildResult
      .staticFiles()
      .filter(
        ([f]) => f.includes("actions.server") || f.includes("server-actions")
      );
    expect(serverActionFilesInStatic.length).toBe(0);
  });

  it("should handle client component references correctly", async () => {
    // Check that client components are properly referenced
    const rscFiles = buildResult.rscFiles();
    expect(rscFiles.length).toBeGreaterThan(0);

    let foundClientComponents = false;
    for (const [fileName, code] of rscFiles) {
      if (code && (code.includes("TodoList") || code.includes('"env":"Client"'))) {
        foundClientComponents = true;
        break;
      }
    }
    expect(foundClientComponents).toBe(true);
  });

  it("should generate proper HTML structure for todo pages", async () => {
    // Check that HTML files are generated with proper structure
    const htmlFiles = buildResult.htmlFiles();
    expect(htmlFiles.length).toBeGreaterThan(0);

    for (const [, code] of htmlFiles) {
      expect(code).toContain("<html");
      expect(code).toContain("</html>");
      expect(code).toContain("<head>");
      expect(code).toContain("<body>");
    }
  });

  it("should separate server and client concerns properly", () => {
    // Verify that server and client builds are properly separated
    const staticJsFiles = buildResult
      .staticChunks()
      .map(([filename]) => filename);
    const serverJsFiles = buildResult
      .serverChunks()
      .map(([filename]) => filename);

    expect(staticJsFiles.length).toBeGreaterThan(0);
    expect(serverJsFiles.length).toBeGreaterThan(0);

    // Server files should contain server-specific code
    const hasServerActions = serverJsFiles.some((f) => f.includes("actions"));
    expect(hasServerActions).toBe(true);
  });

  it("should NOT include client components in server bundles", async () => {
    // Check that server bundles don't contain client-side code
    for (const [fileName, code] of buildResult.serverChunks()) {
      if (fileName.endsWith(".js")) {
        if (code) {
          expect(code).not.toContain("use client");
          expect(code).not.toContain("createRoot");
        }
      }
    }
  });

  it("should NOT include server directives in server bundles", async () => {
    // Check that server bundles don't contain React directives
    for (const [fileName, code] of buildResult.serverChunks()) {
      if (fileName.endsWith(".js")) {
        if (code) {
          expect(code).not.toContain("use server");
          expect(code).not.toContain("useState");
        }
      }
    }
  });

  it("should include registerServerReference in server bundles", async () => {
    // Check that server bundles contain proper server action registration
    let hasServerReference = false;
    for (const [fileName, code] of buildResult.serverChunks()) {
      if (fileName.endsWith(".js")) {
        if (code && code.includes("registerServerReference")) {
          hasServerReference = true;
          break;
        }
      }
    }
    expect(hasServerReference).toBe(true);
  });
});
