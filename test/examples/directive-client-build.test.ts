import { describe, it, expect, beforeAll } from "vitest";
import { setupDirectiveClientProject } from "../setup.js";
import { getSharedBuild, SharedBuildResult } from "./shared-build.js";

/**
 * Regression test for hosting directive-detected `"use client"` modules in the
 * static (`--app`) build.
 *
 * The fixture's client component (`src/components/Counter.tsx`) is recognized
 * ONLY by its top-of-file `"use client"` directive — its filename does not
 * match the `.client.` convention. Before the fix, the static build gave it a
 * raw, unhosted moduleID and react-server-dom-esm rejected the client
 * reference at serialize time. After the fix:
 *
 *  - the build completes (no panic),
 *  - the RSC stream contains a serialized client reference (an `I` import
 *    chunk) for the directive-only module,
 *  - the client component is emitted as a chunk so the hosted moduleID
 *    resolves to a real file.
 */
describe("Directive-detected client module in static build", () => {
  let buildResult: SharedBuildResult;

  beforeAll(async () => {
    buildResult = await getSharedBuild(
      "directive-client-project",
      "directive-client-build",
      {
        setupProject: setupDirectiveClientProject,
        pages: ["/"],
        // Surface any RSC serialization error as a build failure so the test
        // fails loudly if hosting regresses.
        panicThreshold: "all_errors",
        verbose: false,
      }
    );
  }, 30000);

  it("builds without failing on the directive-only client module", () => {
    // A rejected client reference would have surfaced as a route.error and,
    // with panicThreshold "all_errors", thrown out of getSharedBuild.
    expect(buildResult).toBeDefined();
    const routeErrors = buildResult.events.filter(
      (e: any) => e.type === "route.error"
    );
    expect(routeErrors).toHaveLength(0);
  });

  it("emits HTML and RSC for the page", () => {
    const htmlFiles = buildResult.htmlFiles();
    const rscFiles = buildResult.rscFiles();
    expect(htmlFiles.length).toBeGreaterThan(0);
    expect(rscFiles.length).toBeGreaterThan(0);

    // The page's server-rendered shell should be present.
    expect(htmlFiles[0][1]).toContain("Directive Client Test");
  });

  it("serializes the directive-only module as a hosted client reference", () => {
    const rscFiles = buildResult.rscFiles();
    const rscContent = rscFiles.map(([, content]) => content).join("\n");

    // react-server-dom-esm emits client references as `I` import chunks, e.g.
    //   1:I["/components/Counter-<hash>.js",[],"Counter"]
    // The reference must point at the directive-only module by name.
    expect(rscContent).toMatch(/I\[/);
    expect(rscContent).toContain("Counter");
  });

  it("emits the directive-only client module as a client chunk", () => {
    const clientFileNames = buildResult.clientChunks().map(([name]) => name);
    const staticFileNames = buildResult.staticChunks().map(([name]) => name);
    const allClientLike = [...clientFileNames, ...staticFileNames];

    // The hosted moduleID points at an emitted Counter chunk; if it were
    // missing, the html-worker's import of the client ref would 404 at
    // SSG-render time.
    expect(allClientLike.some((name) => /Counter/.test(name))).toBe(true);
  });
});
