import { describe, it, expect } from "vitest";
// Import the SOURCE so this guards plugin/helpers/inputNormalizer.ts directly.
import { stripTrailingDotSegment } from "../../plugin/helpers/inputNormalizer.js";

/**
 * The canonical trailing-segment rule shared by the build's entryFile
 * normalizer (`removeExtension: true`) and the transformer's client-reference
 * moduleID (createModuleID Step 1b). One implementation, one truth — these
 * cases pin its behavior for every naming convention either side sees.
 */
describe("stripTrailingDotSegment", () => {
  it("collapses one trailing segment from a compound name", () => {
    expect(stripTrailingDotSegment("view/View.generated")).toBe("view/View");
  });

  it("collapses exactly ONE segment from a multi-dot name", () => {
    expect(stripTrailingDotSegment("components/A.B.C")).toBe("components/A.B");
  });

  it("handles hyphenated names with dots", () => {
    expect(stripTrailingDotSegment("components/a-b.c")).toBe("components/a-b");
  });

  it("preserves the `.client` suffix", () => {
    expect(stripTrailingDotSegment("components/Link.client")).toBe(
      "components/Link.client"
    );
  });

  it("preserves the `.server` suffix", () => {
    expect(stripTrailingDotSegment("actions/save.server")).toBe(
      "actions/save.server"
    );
  });

  it("ignores dots in directory names (no basename dot → no strip)", () => {
    // The old inline copy in the normalizer truncated this to "view" —
    // the dot must be in the BASENAME to count as a trailing segment.
    expect(stripTrailingDotSegment("view.v2/Widget")).toBe("view.v2/Widget");
  });

  it("strips only the basename segment when both dir and basename have dots", () => {
    expect(stripTrailingDotSegment("view.v2/Widget.generated")).toBe(
      "view.v2/Widget"
    );
  });

  it("leaves dot-less paths untouched", () => {
    expect(stripTrailingDotSegment("components/Widget")).toBe(
      "components/Widget"
    );
  });
});
