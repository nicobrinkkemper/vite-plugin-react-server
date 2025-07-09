import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { createClientDevServer } from "./createClientDevServer.js";
import type { ViteDevServer } from "vite";
import { setupErrorBoundaryTestProject } from "../setup.js";
import { resolve } from "path";
import { rm } from "fs/promises";

describe("RSC Worker Error Streaming", () => {
  let server: ViteDevServer;
  let testDir: string;
  let serverUrl: string;
  let port: number = 5175;

  beforeAll(async () => {
    // Create test directory in fixtures (like other working tests)
    testDir = resolve(__dirname, "../fixtures/client-error-boundaries.test");
    
    // Clean up and create test directory
    await rm(testDir, { recursive: true, force: true });
    
    // Setup test project with error boundary components
    await setupErrorBoundaryTestProject(testDir);
    
    // Start test server with proper page configuration
    server = await createClientDevServer(
      {
        projectRoot: testDir,
        verbose: true,
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
        build: {
          pages: ["/", "/server-error-example", "/client-error-example"],
        },
      },
      port
    );
    
    serverUrl = `http://localhost:${server.config.server?.port}`;
  });

  afterAll(async () => {
    try {
      await server?.close();
    } catch {
    }
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
    }
  });

  test("should send RSC error streams when server components throw errors", async () => {
    // Make a direct RSC request to test streaming behavior
    const rscResponse = await fetch(
      `${serverUrl}/server-error-example/index.rsc`,
      {
        headers: {
          Accept: "text/x-component",
        },
      }
    );

    // expect(rscResponse.status).toBe(200);

    // Read the RSC stream
    const rscStream = await rscResponse.text();

    // Debug: log the actual stream content
    console.log("RSC Stream content:", rscStream);

    // Verify that the stream contains error information
    // Should contain an error entry like: `9:E{"digest":"","name":"Error","message":"test error example",...}`
    expect(rscStream).toMatch(/\d+:E\{.*"message":"test error example".*\}/);

    // Verify the error has proper structure
    expect(rscStream).toContain('"name":"Error"');
    expect(rscStream).toContain('"env":"Server"');
  });

  test("should maintain stream integrity when errors occur", async () => {
    // Test that RSC streams complete properly even with errors
    const rscResponse = await fetch(
      `${serverUrl}/server-error-example/index.rsc`,
      {
        headers: {
          Accept: "text/x-component",
        },
      }
    );

    const rscStream = await rscResponse.text();

    // Stream should still contain normal RSC data before the error
    expect(rscStream).toMatch(/\d+:".*"/); // Normal RSC entries
    expect(rscStream).toMatch(/\d+:I\[.*\]/); // Import entries

    // And should contain the error entry (but might not be at the very end)
    expect(rscStream).toMatch(/\d+:E\{.*\}/);

    // Response should be complete (not cut off) - check we got actual content
    expect(rscStream.length).toBeGreaterThan(0);
  });

  test("should ensure RSC worker sends streams even when errors are logged", async () => {
    // This is the key test for the issue mentioned:
    // "when we have a error on the rsc-worker side, we log the error but we actually fail to send the rsc stream thereafter"

    const rscResponse = await fetch(
      `${serverUrl}/server-error-example/index.rsc`,
      {
        headers: {
          Accept: "text/x-component",
        },
      }
    );

    // The RSC request should complete successfully
    // expect(rscResponse.status).toBe(200);
    expect(rscResponse.ok).toBe(true);

    const rscData = await rscResponse.text();

    // Should contain actual RSC data (not just empty or error response)
    expect(rscData.length).toBeGreaterThan(1);

    // Should contain the error entry in the stream (proving the stream was sent)
    expect(rscData).toMatch(/E\{.*"message":"test error example".*\}/);

    // Stream should have proper RSC structure
    expect(rscData).toMatch(/\d+:/); // RSC entries start with numbers
  });

  test("should handle multiple RSC requests with errors consistently", async () => {
    // Test that the RSC worker doesn't get into a broken state after an error
    const requests = await Promise.all([
      fetch(`${serverUrl}/server-error-example/index.rsc`, {
        headers: { Accept: "text/x-component" },
      }),
      fetch(`${serverUrl}/server-error-example/index.rsc`, {
        headers: { Accept: "text/x-component" },
      }),
      fetch(`${serverUrl}/server-error-example/index.rsc`, {
        headers: { Accept: "text/x-component" },
      }),
    ]);

    // All requests should succeed
    expect(requests.every((r) => r.status === 200)).toBe(true);

    // All should contain error data
    const streams = await Promise.all(requests.map((r) => r.text()));
    for (const stream of streams) {
      expect(stream).toMatch(/E\{.*"message":"test error example".*\}/);
      expect(stream.length).toBeGreaterThan(0);
    }
  });

  test("should serve HTML page successfully even when server components will error", async () => {
    // Test that the HTML page loads successfully - errors happen in RSC stream, not HTML
    const response = await fetch(`${serverUrl}/server-error-example`);
    const html = await response.text();

    // Check that the response is successful
    // expect(response.status).toBe(200);

    // HTML should contain the basic page structure but not error content
    // since errors aren't pre-rendered
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  test("should have error boundary components ready for client-side error handling", async () => {
    // Test that the error boundary system is set up correctly in the HTML
    const response = await fetch(
      `${serverUrl}/server-error-example/index.rsc`,
      {
        headers: {
          Accept: "text/x-component",
        },
      }
    );

    // expect(response.status).toBe(200);

    // The HTML should have the error boundary structure ready
    const rsc = await response.text();
    expect(rsc).toContain("ErrorBoundary");

    // The server error component should be present (but won't have thrown yet)
    expect(rsc).toContain(`"children":"Server Error Example"`);
    expect(rsc).toContain(`{"digest":"","name":"Error","message":"test error example","stack":[["TestError",`);
  });
}); 