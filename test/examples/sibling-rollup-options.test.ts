import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "path";
import type { Plugin } from "vite";
import { setupTestProject } from "../setup.js";
import type {
  PluginEvent,
  FileWriteDoneEvent,
} from "../../dist/plugin/types.js";
import { doBuild } from "../doBuild.js";

// A sibling plugin whose config hook contributes build.rollupOptions — the
// shape @vitejs/plugin-react's vite:react-refresh plugin returns (its
// silenceUseClientWarning onwarn wrapper). On rolldown-vite, Vite's compat
// shim materializes such a contribution as a real build.rolldownOptions key
// with rollupOptions left as a getter over it. Any vprs config assembly that
// spreads config.build then carries that stale rolldownOptions (no input)
// into the environment configs, where it outranks the rollupOptions.input
// vprs writes — every environment falls back to the default index.html
// entry and the ssr build rejects it ("rolldownOptions.input should not be
// an html file when building for SSR").
const siblingWithRollupOptions = (): Plugin => ({
  name: "test:sibling-rollup-options",
  // plugin-react's contributing plugin is enforce:"pre" and registered before
  // vprs, so its config result is already merged (and compat-materialized)
  // when vprs's config hooks read config.build.
  enforce: "pre",
  config: () => ({
    build: {
      rollupOptions: {
        onwarn(warning, defaultHandler) {
          defaultHandler(warning);
        },
      },
    },
  }),
});

describe("sibling plugin contributing build.rollupOptions", () => {
  const testDir = resolve(__dirname, "../fixtures/sibling-rollup-options.test");
  let events: PluginEvent[];

  beforeAll(async () => {
    await setupTestProject(testDir);
    ({ events } = await doBuild({ projectRoot: testDir }, [
      siblingWithRollupOptions(),
    ]));
  }, 120_000);

  it("keeps vprs's per-environment inputs and renders the page", () => {
    const htmlEvent = events.find(
      (e) => e.type === "file.write.done" && e.data.fileType === "html"
    ) as FileWriteDoneEvent | undefined;
    expect(htmlEvent, "expected an html file.write.done event").toBeDefined();
    expect(htmlEvent!.data.content).toContain("<div");
  });

  it("reports no route errors", () => {
    const routeErrors = events.filter((e) => e.type === "route.error");
    expect(routeErrors).toEqual([]);
  });
});
