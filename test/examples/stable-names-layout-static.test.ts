import { describe, it } from "vitest";
import { expectLayout } from "./stable-names.layout.js";

// One build per file: see expectReferencesResolve in stable-names.layout.ts.
describe("browser file layout: build.assetsDir = \"static\"", () => {
  it("moves every generated file, images and fonts included", async () => {
    await expectLayout("static", "static");
  });
});
