import { expect, test, describe, afterAll } from "vitest";
import { getSharedBuild, cleanupSharedBuilds } from "./shared-build.js";
import { setupShellHookErrorTestProject } from "../setup.js";

/**
 * Regression guard for the silent SSG hang/degrade on a shell render error.
 *
 * A "use client" component that throws during the server-side HTML shell
 * render (e.g. a router hook rendered outside its provider — here simulated
 * with a deterministic `typeof window === "undefined"` throw) used to either
 * HANG the static build with no output (the render error destroyed the HTML
 * stream before the fileWriter subscribed, so it waited forever) or complete
 * with exit 0 while emitting a shell-only document. The build must instead
 * surface the component error per panicThreshold.
 */
describe("SSG shell render error surfacing", () => {
  test(
    'panicThreshold "all_errors": the build FAILS with the component error (no hang, no silent degrade)',
    { timeout: 90_000 },
    async () => {
      await expect(
        getSharedBuild("shell-hook-error-test-project", "shell-error-panic-all", {
          setupProject: setupShellHookErrorTestProject,
          pages: ["/"],
          panicThreshold: "all_errors",
          verbose: false,
          Page: "src/page/page.tsx",
          props: "src/page/props.ts",
        })
      ).rejects.toThrow(/ShellThrow: rendered outside the browser/);
    }
  );

  test(
    'panicThreshold "none": the build completes (degrade-and-continue stays available)',
    { timeout: 90_000 },
    async () => {
      await expect(
        getSharedBuild("shell-hook-error-test-project", "shell-error-panic-none", {
          setupProject: setupShellHookErrorTestProject,
          pages: ["/"],
          panicThreshold: "none",
          verbose: false,
          Page: "src/page/page.tsx",
          props: "src/page/props.ts",
        })
      ).resolves.toBeDefined();
    }
  );

  afterAll(async () => {
    await cleanupSharedBuilds();
  });
});
