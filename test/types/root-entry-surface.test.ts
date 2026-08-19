/**
 * The `.` entry's TYPE surface, resolved through the exports map like a real
 * consumer (`exports['.'].types` → dist/plugin/index.d.ts). Runtime suites
 * prove the values; this pins the types — `import type { StreamPluginOptions }
 * from "vite-plugin-react-server"` is the documented consumer spelling and
 * regressed silently when the root entry stopped re-exporting ./types.js.
 */
import { describe, it, expectTypeOf } from "vitest";
import type { StreamPluginOptions } from "vite-plugin-react-server";
import {
  vitePluginReactServer,
  vitePluginReactClient,
  getCondition,
} from "vite-plugin-react-server";

describe("root package entry type surface", () => {
  it("exposes StreamPluginOptions", () => {
    expectTypeOf<StreamPluginOptions>().toHaveProperty("runner");
    expectTypeOf<StreamPluginOptions["runner"]>().toEqualTypeOf<
      "main" | "isolated" | "edge"
    >();
  });

  it("exposes the plugin functions and getCondition", () => {
    expectTypeOf(vitePluginReactServer).toBeFunction();
    expectTypeOf(vitePluginReactClient).toBeFunction();
    expectTypeOf(getCondition).toBeFunction();
  });
});
