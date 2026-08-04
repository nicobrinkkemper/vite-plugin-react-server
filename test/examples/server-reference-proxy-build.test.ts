import { describe, it, expect, beforeAll } from "vitest";
import { setupServerReferenceProxyProject } from "../setup.js";
import { getSharedBuild, SharedBuildResult } from "./shared-build.js";

/**
 * Build-side guard for the client-imported "use server" module path.
 *
 * The dev path is covered by test/dev/client-imports-server-action.test.ts;
 * this covers the BUILD (rolldown) transform context, where the analysis that
 * gates proxy emission must not depend on the bundler's `this.parse` (Oxc on
 * Vite 8, different AST shape than Rollup's acorn). A silently failing parse
 * skips proxy emission and bundles server code into the browser build:
 *
 *  - the browser chunk must hold createServerReference proxies wired to the
 *    hosted action id (`<moduleID>#<export>`), not the server function body,
 *  - the SSR/static side must hold the render-safe stub, which only throws if
 *    wrongly invoked during render,
 *  - the server-only body must appear in NO client-reachable chunk.
 */
describe("Client-imported 'use server' module in static build", () => {
  let buildResult: SharedBuildResult;

  beforeAll(async () => {
    buildResult = await getSharedBuild(
      "server-reference-proxy-project",
      "server-reference-proxy-build",
      {
        setupProject: setupServerReferenceProxyProject,
        pages: ["/"],
        panicThreshold: "all_errors",
        verbose: false,
      }
    );
  }, 30000);

  it("builds without route errors", () => {
    expect(buildResult).toBeDefined();
    const routeErrors = buildResult.events.filter(
      (e: any) => e.type === "route.error"
    );
    expect(routeErrors).toHaveLength(0);
  });

  it("emits createServerReference proxies with the hosted action id in the browser chunks", () => {
    const clientContent = buildResult
      .clientChunks()
      .map(([, content]) => content)
      .join("\n");
    expect(clientContent).toContain("createServerReference");
    expect(clientContent).toContain("#addItem");
  });

  it("keeps the server function body out of every client-reachable chunk", () => {
    const allClientLike = [
      ...buildResult.clientChunks(),
      ...buildResult.staticChunks(),
    ]
      .map(([, content]) => content)
      .join("\n");
    expect(allClientLike).not.toContain("server-only-body-marker");
  });

  it("emits the render-safe stub on the SSR/static side", () => {
    const staticContent = buildResult
      .staticChunks()
      .map(([, content]) => content)
      .join("\n");
    expect(staticContent).toContain("cannot run during SSR");
    expect(staticContent).not.toContain("createServerReference");
  });
});
