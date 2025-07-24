import { expect, test, describe, beforeAll, afterAll, vi } from "vitest";
import { createServerDevServer } from "./createServerDevServer.js";
import type { ViteDevServer } from "vite";
import { setupErrorBoundaryTestProject } from "../setup.js";
import { resolve } from "path";
import { rm } from "fs/promises";

let servers: Record<string, ViteDevServer> = {};
describe("RSC Worker Error Streaming", () => {
  let testDir: string;
  beforeAll(async () => {
    // Create test directory in fixtures (like other working tests)
    testDir = resolve(__dirname, "../fixtures/error-boundaries.test");

    // Clean up and create test directory
    await rm(testDir, { recursive: true, force: true });

    // Setup test project with error boundary components
    await setupErrorBoundaryTestProject(testDir);
  });

  afterAll(async () => {
    try {
      // Clean up all cached servers
      for (const [port, server] of Object.entries(servers)) {
        try {
          await server.close();
        } catch (error) {
          // Server might have already crashed, which is expected for some tests
        }
      }
      // Clear the servers cache
      Object.keys(servers).forEach((key) => delete servers[key]);

      await rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  const createServerWithPanicThreshold = async (
    panicThreshold: "none" | "critical_errors" | "all_errors",
    port: number
  ) => {
    // Check if we have a cached server for this port
    const cachedServer = servers[String(port)];
    if (cachedServer) {
      // Verify the server is still running by checking if it has a port
      if (cachedServer.config.server?.port) {
        return cachedServer;
      } else {
        // Server crashed, remove from cache
        delete servers[String(port)];
      }
    }

    servers[String(port)] = await createServerDevServer(
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
          pages: ["/", "/server-error-example"],
        },
        panicThreshold,
      },
      port
    );

    return servers[String(port)];
  };

  const cleanupServer = async (server: ViteDevServer) => {
    const portKey = String(server.config.server?.port);

    try {
      // Try to close the server gracefully
      await server.close();
    } catch (error) {
      // Server might have already crashed due to panic threshold
      // This is expected behavior for "all_errors"
    } finally {
      // Always remove from cache, regardless of whether close succeeded
      if (portKey && servers[portKey]) {
        delete servers[portKey];
      }
    }
  };

  test("panicThreshold: none - should handle React component errors gracefully", async () => {
    const server = await createServerWithPanicThreshold("none", 2336);
    const serverUrl = `http://localhost:${server.config.server?.port}`;
    const loggerSpy = vi
      .spyOn(server.config.customLogger || server.config.logger, "error")
      .mockImplementation(() => {});

    try {
      // Make a direct RSC request to test streaming behavior
      const rscResponse = await fetch(
        `${serverUrl}/server-error-example/index.rsc`,
        {
          headers: {
            Accept: "text/x-component",
          },
        }
      );

      // Should complete successfully
      expect(rscResponse.ok).toBe(true);

      // Read the RSC stream
      const rscStream = await rscResponse.text();

      // Should contain error information in the stream
      expect(rscStream).toMatch(/\d+:E\{.*"message":"test error example".*\}/);
      expect(rscStream).toContain('"name":"Error"');
      expect(rscStream).toContain('"env":"Server"');

      // Error should be logged but not cause panic (since we are in test mode it will not log)
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error: test error example"),
        expect.objectContaining({
          error: expect.objectContaining({
            message: "test error example",
          }),
          timestamp: false,
          clear: false,
        })
      );
    } finally {
      await cleanupServer(server);
    }
  });

  test("panicThreshold: critical_errors - should handle React component errors gracefully", async () => {
    const server = await createServerWithPanicThreshold(
      "critical_errors",
      2338
    );
    const serverUrl = `http://localhost:${server.config.server?.port}`;
    const loggerSpy = vi
      .spyOn(server.config.customLogger || server.config.logger, "error")
      .mockImplementation(() => {});

    try {
      // Make a direct RSC request to test streaming behavior
      const rscResponse = await fetch(
        `${serverUrl}/server-error-example/index.rsc`,
        {
          headers: {
            Accept: "text/x-component",
          },
        }
      );

      // Should complete successfully
      expect(rscResponse.ok).toBe(true);

      // Read the RSC stream
      const rscStream = await rscResponse.text();

      // Should contain error information in the stream
      expect(rscStream).toMatch(/\d+:E\{.*"message":"test error example".*\}/);
      expect(rscStream).toContain('"name":"Error"');
      expect(rscStream).toContain('"env":"Server"');

      // Error should be logged but not cause panic (React component errors are not critical)
      // expect(loggerSpy).toHaveBeenCalledWith(
      //   expect.stringContaining("Error: test error example"),
      //   expect.objectContaining({
      //     error: expect.objectContaining({
      //       message: "test error example",
      //     }),
      //     timestamp: false,
      //     clear: false,
      //   })
      // );
    } finally {
      await cleanupServer(server);
    }
  });

  test("should maintain stream integrity when errors occur across all panic thresholds", async () => {
    const panicThresholds: Array<"none" | "critical_errors" | "all_errors"> = [
      "none",
      "critical_errors",
      "all_errors",
    ];

    for (const panicThreshold of panicThresholds) {
      const portOffset =
        panicThreshold === "all_errors"
          ? 100
          : panicThreshold === "critical_errors"
          ? 200
          : 0;
      const server = await createServerWithPanicThreshold(
        panicThreshold,
        2340 + portOffset
      );
      const serverUrl = `http://localhost:${server.config.server?.port}`;

      try {
        // Test that RSC streams complete properly even with errors
        const rscResponse = await fetch(
          `${serverUrl}/server-error-example/index.rsc`,
          {
            headers: {
              Accept: "text/x-component",
            },
          }
        );

        // Should succeed for other panic thresholds
        expect(rscResponse.ok).toBe(true);
        const rscStream = await rscResponse.text();

        // Stream should still contain normal RSC data before the error
        expect(rscStream).toMatch(/\d+:".*"/); // Normal RSC entries

        // And should contain the error entry
        expect(rscStream).toMatch(/\d+:E\{.*\}/);

        // Response should be complete (not cut off) - check we got actual content
        expect(rscStream.length).toBeGreaterThan(0);
      } finally {
        await cleanupServer(server);
      }
    }
  });

  test("should handle multiple RSC requests with errors consistently across all panic thresholds", async () => {
    const panicThresholds: Array<"none" | "critical_errors" | "all_errors"> = [
      "none",
      "critical_errors",
      "all_errors",
    ];

    for (const panicThreshold of panicThresholds) {
      const portOffset =
        panicThreshold === "all_errors"
          ? 100
          : panicThreshold === "critical_errors"
          ? 200
          : 0;
      const server = await createServerWithPanicThreshold(
        panicThreshold,
        2341 + portOffset
      );
      const serverUrl = `http://localhost:${server.config.server?.port}`;


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

      // All requests should succeed for other panic thresholds
      expect(requests.every((r) => r.ok)).toBe(true);

      // All should contain error data
      const streams = await Promise.all(requests.map((r) => r.text()));
      for (const stream of streams) {
        expect(stream).toMatch(/E\{.*"message":"test error example".*\}/);
        expect(stream.length).toBeGreaterThan(0);
      }
    }
  });

  test("should serve HTML page successfully even when server components will error", async () => {
    // Use a fresh server on a different port to avoid conflicts with previous tests
    const server = await createServerWithPanicThreshold("none", 2350);
    const serverUrl = `http://localhost:${server.config.server?.port}`;

    try {
      // Test that the HTML page loads successfully - errors happen in RSC stream, not HTML
      const response = await fetch(`${serverUrl}/server-error-example`);

      // Check that the response is successful
      expect(response.ok).toBe(true);
      expect(server.config.server?.port).toBeDefined();

      const html = await response.text();
      // HTML should contain the basic page structure but not error content
      // since errors aren't pre-rendered
      expect(html).toContain("<html");
      expect(html).toContain("</html>");
    } finally {
      await cleanupServer(server);
    }
  });
});
