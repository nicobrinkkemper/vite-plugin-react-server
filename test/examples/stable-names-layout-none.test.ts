import { describe, it } from "vitest";
import { expectLayout } from "./stable-names.layout.js";

// One build per file: see expectReferencesResolve in stable-names.layout.ts.
describe("browser file layout: build.assetsDir = \"\"", () => {
  it("is the tsc-like tree with no prefix and no leading slash", async () => {
    await expectLayout("", "");
  });
});
