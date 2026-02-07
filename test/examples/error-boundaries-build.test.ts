import { expect, test, describe, afterAll } from "vitest";
import {
  getSharedBuild,
  cleanupSharedBuilds,
  getHtmlContentFromEvents,
} from "./shared-build.js";
import { setupErrorBoundaryTestProject } from "../setup.js";

describe("Error Boundaries Build (Cross-Environment)", () => {
  test("should generate error boundary components in static output", async () => {
    await expect(
      getSharedBuild(
        "error-boundaries-test-project",
        "error-boundaries-build-none",
        {
          setupProject: setupErrorBoundaryTestProject,
          pages: ["/", "/server-error-example"], // Only server error for now
          panicThreshold: "none", // Prevent errors from throwing during initial build
          verbose: false,
          Page: (url: string) => {
            if (url === "/server-error-example") {
              return "src/page/server-error-example/page.tsx";
            }
            return "src/page/page.tsx";
          },
          props: (url: string) => {
            if (url === "/server-error-example") {
              return "src/page/server-error-example/props.ts";
            }
            return "src/page/props.ts";
          },
        }
      )
    ).resolves.toBeDefined();
  }, 30000);

  test('should not fail to build with panicThreshold: "critical_errors" when page has server errors', async () => {
    await expect(
      getSharedBuild(
        "error-boundaries-test-project",
        "error-boundaries-panic-critical-errors",
        {
          setupProject: setupErrorBoundaryTestProject,
          pages: ["/", "/server-error-example"], // Include the error page
          panicThreshold: "critical_errors",
          verbose: false,
          Page: (url: string) => {
            if (url === "/server-error-example") {
              return "src/page/server-error-example/page.tsx";
            }
            return "src/page/page.tsx";
          },
          props: (url: string) => {
            if (url === "/server-error-example") {
              return "src/page/server-error-example/props.ts";
            }
            return "src/page/props.ts";
          },
        }
      )
    ).resolves.toBeDefined();
  }, 30000);

  test('should fail to build with panicThreshold: "all_errors" when page has server errors', async () => {
      await expect(getSharedBuild(
        "error-boundaries-test-project",
        "error-boundaries-panic-all-errors",
        {
          setupProject: setupErrorBoundaryTestProject,
          pages: ["/", "/server-error-example"], // Include the error page
          panicThreshold: "all_errors",
          verbose: false,
          Page: (url: string) => {
            if (url === "/server-error-example") {
              return "src/page/server-error-example/page.tsx";
            }
            return "src/page/page.tsx";
          },
          props: (url: string) => {
            if (url === "/server-error-example") {
              return "src/page/server-error-example/props.ts";
            }
            return "src/page/props.ts";
          },
        }
      )).rejects.toThrow();
  }, 30000);
});
