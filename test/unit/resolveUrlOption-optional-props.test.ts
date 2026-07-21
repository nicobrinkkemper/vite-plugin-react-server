import { describe, it, expect } from "vitest";
import { resolveUrlOption } from "../../plugin/config/resolveUrlOption.js";

// Props are optional by contract: fileRouter types `props` as
// `(url) => string | undefined`, and a route directory may carry a page.tsx
// with no sibling props file. An undefined return used to resolve to
// `type: "error"`, which made resolveBuildPages drop the route from the build
// worklist entirely — the page silently didn't exist in the output.
describe("resolveUrlOption: optional props", () => {
  const base = {
    pageExportName: "Page",
    propsExportName: "props",
    rootExportName: "Root",
    htmlExportName: "Html",
  } as any;

  it("a props function returning undefined resolves to no-props, not an error", async () => {
    const result = await resolveUrlOption(
      { ...base, props: (_url: string) => undefined },
      "props",
      "/about"
    );
    expect(result.type).toBe("success");
    expect((result as any).props).toBeUndefined();
  });

  it("an async props function resolving undefined resolves to no-props", async () => {
    const result = await resolveUrlOption(
      { ...base, props: async (_url: string) => undefined },
      "props",
      "/about"
    );
    expect(result.type).toBe("success");
    expect((result as any).props).toBeUndefined();
  });

  it("a props function returning a string still resolves the path", async () => {
    const result = await resolveUrlOption(
      { ...base, props: (_url: string) => "src/routes/props.ts" },
      "props",
      "/"
    );
    expect(result.type).toBe("success");
    expect((result as any).props).toBe("src/routes/props.ts");
  });

  it("a Page function returning undefined is still an error (a route needs a page)", async () => {
    const result = await resolveUrlOption(
      { ...base, Page: (_url: string) => undefined },
      "Page",
      "/about"
    );
    expect(result.type).toBe("error");
  });
});
