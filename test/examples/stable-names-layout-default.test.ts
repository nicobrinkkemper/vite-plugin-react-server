import { describe, it } from "vitest";
import { DEFAULT_CONFIG } from "../../dist/plugin/config/defaults.js";
import { expectLayout } from "./stable-names.layout.js";

// One build per file: see expectReferencesResolve in stable-names.layout.ts.
describe("browser file layout: default build.assetsDir", () => {
  it("puts every generated file under assets/ in its source directory, the page's ?url import included", async () => {
    await expectLayout(undefined, DEFAULT_CONFIG.BUILD.assetsDir);
  });
});
