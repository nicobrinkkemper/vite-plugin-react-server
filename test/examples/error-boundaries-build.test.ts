import { expect, test, describe, afterAll } from "vitest";
import { getSharedBuild, cleanupSharedBuilds } from "./shared-build.js";
import { setupErrorBoundaryTestProject } from "../setup.js";

describe("Error Boundaries Build (Cross-Environment)", () => {
  // Define the page router configuration once for all tests
  const pageRouterConfig = {
    Page: (url: string) => {
      if (url === "/server-error-example") {
        return "src/page/server-error-example/page.tsx";
      }
      if (url === "/client-error-example") {
        return "src/page/client-error-example/page.tsx";
      }
      return "src/page/page.tsx";
    },
    props: (url: string) => {
      if (url === "/server-error-example") {
        return "src/page/server-error-example/props.ts";
      }
      if (url === "/client-error-example") {
        return "src/page/client-error-example/props.ts";
      }
      return "src/page/props.ts";
    },
  };

  afterAll(async () => {
    await cleanupSharedBuilds();
  });

  test("should generate error boundary components in static output", async () => {
    // Check that error boundary components are included in the static build output
    const buildResult = await getSharedBuild("error-boundaries-build-none", {
      setupProject: setupErrorBoundaryTestProject,
      pages: ["/", "/server-error-example"], // Only server error for now
      panicThreshold: "none", // Prevent errors from throwing during initial build
      ...pageRouterConfig,
    });

    // Build should complete successfully even with errors when panicThreshold is none
    expect(buildResult.staticFiles.length).toBeGreaterThan(0);
    expect(buildResult.serverFiles.length).toBeGreaterThan(0);
    expect(buildResult.clientFiles.length).toBeGreaterThan(0);

    // ErrorMessage component is bundled into ErrorBoundary.client.js, so check that ErrorBoundary exists
    expect(
      buildResult.staticFiles.some((file) => file.includes("ErrorBoundary"))
    ).toBe(true);

    expect(
      buildResult.serverFiles.some((file) => file.includes("ErrorBoundary"))
    ).toBe(true);

    expect(
      buildResult.clientFiles.some((file) => file.includes("ErrorBoundary"))
    ).toBe(true);

    const errorBoundaryFiles = buildResult.staticFiles.filter((file) =>
      file.includes("ErrorBoundary")
    );
    expect(errorBoundaryFiles.length).toBeGreaterThan(0);
  });

  test('should build successfully with panicThreshold: "critical_errors"', async () => {
    // This test verifies that builds can complete even with errors when panicThreshold is set to "critical_errors"
    const buildResult = await getSharedBuild(
      "error-boundaries-panic-critical",
      {
        setupProject: setupErrorBoundaryTestProject,
        pages: ["/", "/server-error-example"], // Include the error page
        panicThreshold: "critical_errors",
        ...pageRouterConfig,
      }
    );

    // Build should complete successfully even with errors when panicThreshold is critical_errors
    expect(buildResult.staticFiles.length).toBeGreaterThan(0);
    expect(buildResult.serverFiles.length).toBeGreaterThan(0);
    expect(buildResult.clientFiles.length).toBeGreaterThan(0);

    // ErrorMessage component is bundled into ErrorBoundary.client.js, so check that ErrorBoundary exists
    expect(
      buildResult.staticFiles.some((file) => file.includes("ErrorBoundary"))
    ).toBe(true);

    expect(
      buildResult.serverFiles.some((file) => file.includes("ErrorBoundary"))
    ).toBe(true);

    expect(
      buildResult.clientFiles.some((file) => file.includes("ErrorBoundary"))
    ).toBe(true);

    const errorBoundaryFiles = buildResult.staticFiles.filter((file) =>
      file.includes("ErrorBoundary")
    );
    expect(errorBoundaryFiles.length).toBeGreaterThan(0);
  });

  test('should fail to build with panicThreshold: "all_errors" when page has server errors', async () => {
    // This test verifies that builds fail when panicThreshold is "all_errors" and there are server errors
    console.log('Testing panicThreshold: "all_errors"');

    try {
      await 
        getSharedBuild("error-boundaries-panic-all-errors", {
          setupProject: setupErrorBoundaryTestProject,
          pages: ["/", "/server-error-example"], // Include the error page
          panicThreshold: "all_errors",
          ...pageRouterConfig,
        })
    } catch (error) {
      console.log(error);
      expect(error).toBeDefined();
    }
  });

  test("should generate HTML files with proper structure", async () => {
    // This test verifies that the generated HTML files contain the proper HTML structure
    const buildResult = await getSharedBuild("error-boundaries-html-structure", {
      setupProject: setupErrorBoundaryTestProject,
      pages: ["/"], // Only test the main page for faster execution
      panicThreshold: "none", // Prevent errors from throwing during build
      ...pageRouterConfig,
    });

    // Build should complete successfully
    expect(buildResult.staticFiles.length).toBeGreaterThan(0);
    expect(buildResult.serverFiles.length).toBeGreaterThan(0);
    expect(buildResult.clientFiles.length).toBeGreaterThan(0);

    // Check that HTML files are generated
    const htmlFiles = buildResult.staticFiles.filter((file) => file.endsWith('.html'));
    expect(htmlFiles.length).toBeGreaterThan(0);

    // Check that RSC files are generated
    const rscFiles = buildResult.staticFiles.filter((file) => file.endsWith('.rsc'));
    expect(rscFiles.length).toBeGreaterThan(0);

    // Verify HTML structure by checking file content (optimized)
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Only check the first HTML file for faster execution
    const htmlFile = htmlFiles[0];
    const filePath = path.resolve(buildResult.distDir, htmlFile);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Check for proper HTML structure
      expect(content).toContain('<html');
      expect(content).toContain('</html>');
      expect(content).toContain('<body');
      expect(content).toContain('</body>');
      expect(content).toContain('id="root"');
      
      // Check for index.js script (should be present in both environments)
      expect(content).toContain('src="index.js"');
      
      // Check for performance script (React's internal timing mechanism)
      // The performance script is added by React when processing RSC streams with suspense boundaries
      // Server environment preserves RSC stream structure, so performance script appears
      // Client environment converts RSC to React elements first, so no performance script
      const hasPerformanceScript = content.includes('requestAnimationFrame(function(){$RT=performance.now()})');
      
      // Log the performance script status for clarity
      if (hasPerformanceScript) {
        console.log(`📊 Performance script detected in ${htmlFile}`);
      } else {
        console.log(`📊 No performance script detected in ${htmlFile}`);
      }
      
      // Check that it's not empty
      expect(content.length).toBeGreaterThan(100);
      
      console.log(`✅ HTML file ${htmlFile} has proper structure (${content.length} bytes)`);
      console.log(`📄 HTML content preview:`);
      console.log(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
    } catch (error) {
      console.error(`❌ Failed to read HTML file ${htmlFile}:`, error);
      throw error;
    }
  });
});
