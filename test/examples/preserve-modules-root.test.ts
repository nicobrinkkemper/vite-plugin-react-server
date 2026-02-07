import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getSharedBuild } from "./shared-build.js";
import { setupTestProject } from "../setup.js";

describe("Preserve Modules Root (Cross-Environment)", () => {
  let buildResult: any;

  beforeAll(async () => {
    // Remove test fixtures directory to ensure clean iteration
    const { rmSync } = await import('fs');
    const { join } = await import('path');
    const testDir = join(process.cwd(), 'test/fixtures/shared/preserve-modules-root-test-project');
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (e) {
      // Directory might not exist, that's fine
    }
    
    // Use the shared build system to test preserve modules root functionality
    buildResult = await getSharedBuild('preserve-modules-root-test-project', 'preserve-modules-root', {
      setupProject: setupTestProject,
      pages: ["/"],
      verbose: false,
      build: {
        preserveModulesRoot: true,
      },
    });
  });

  afterAll(async () => {
    // Cleanup is handled by the shared build utility
  });

  it("should preserve module structure in server build when preserveModulesRoot is true", () => {
    const serverChunks = buildResult.serverChunks();
    expect(serverChunks.length).toBeGreaterThan(0);

    // When preserveModulesRoot: true, should keep src/ in the output paths
    const preservedModules = serverChunks.filter(([filename]) => 
      filename.includes('src/') && !filename.includes('node_modules/')
    );
    
    expect(preservedModules.length).toBeGreaterThan(0);
    
    // Verify that the module paths preserve the source structure including src/
    const hasPageModule = preservedModules.some(([filename]) => 
      filename.includes('src/page/page')
    );
    expect(hasPageModule).toBe(true);
  });

  it("should preserve module structure in client build when preserveModulesRoot is true", () => {
    // Check that files are generated with src/ structure in the actual file system
    const clientFiles = buildResult.clientFiles();
    expect(clientFiles.length).toBeGreaterThan(0);

    // When preserveModulesRoot: true, client files should keep src/ in paths
    const preservedModules = clientFiles.filter(([filename]) => 
      filename.includes('src/') && !filename.includes('node_modules/')
    );
    
    // Client build should preserve some module structure
    expect(preservedModules.length).toBeGreaterThan(0);
  });

  it("should handle static generation with preserved modules", () => {
    const events = buildResult.events;
    const staticEvents = events.filter((e: any) => 
      e.type === 'build.ssg.start' || e.type === 'build.ssg.end'
    );
    
    expect(staticEvents.length).toBeGreaterThan(0);
    
    // Verify static files were generated using the event-based methods
    const htmlFiles = buildResult.htmlFiles();
    const rscFiles = buildResult.rscFiles();
    
    expect(htmlFiles.length).toBeGreaterThan(0);
    expect(rscFiles.length).toBeGreaterThan(0);
  });

  it("should maintain proper module resolution with preserved structure", () => {
    // Verify the build completed successfully without import/resolution errors
    const buildEvents = buildResult.events;
    const errorEvents = buildEvents.filter((e: any) => e.type === 'error');
    
    expect(errorEvents.length).toBe(0);
    
    // Verify all expected bundles were created
    const serverChunks = buildResult.serverChunks();
    const clientChunks = buildResult.clientChunks();
    const staticFiles = buildResult.staticFiles();
    
    expect(serverChunks.length).toBeGreaterThan(0);
    expect(clientChunks.length).toBeGreaterThan(0);
    expect(staticFiles.length).toBeGreaterThan(0);
  });
});
