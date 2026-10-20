import { describe, it, expect } from "vitest";
import {
  toCanonicalModuleId,
  buildCombinedGraphChunkHashInput,
  createCombinedGraphChunkHash,
} from "vite-plugin-react-server/config";

describe("combinedGraphChunkInputs", () => {
  const root = "/home/proj";

  it("canonicalizes absolute ids to project-relative posix paths", () => {
    expect(toCanonicalModuleId(root, "/home/proj/src/a.tsx")).toBe(
      "src/a.tsx"
    );
    expect(toCanonicalModuleId(root, "/home/proj/src/a.tsx?v=1")).toBe(
      "src/a.tsx"
    );
    expect(toCanonicalModuleId(root, "src/a.tsx")).toBe("src/a.tsx");
  });

  it("builds the same bag for absolute and relative module ids", () => {
    const source = "export const x = 1;";
    const fromAbs = buildCombinedGraphChunkHashInput(root, {
      name: "a",
      moduleIds: [`${root}/src/a.tsx`],
    }, {
      moduleSourceOverrides: { "src/a.tsx": source },
    });
    const fromRel = buildCombinedGraphChunkHashInput(root, {
      name: "a",
      moduleIds: ["src/a.tsx"],
    }, {
      moduleSourceOverrides: { "src/a.tsx": source },
    });
    expect(createCombinedGraphChunkHash(fromAbs)).toBe(
      createCombinedGraphChunkHash(fromRel)
    );
  });

  it("shared chunk with no facade hashes every module source", () => {
    const bag = buildCombinedGraphChunkHashInput(root, {
      name: "courseSave",
      facadeModuleId: null,
      moduleIds: ["src/courseSave.ts", "src/catalog.ts"],
    }, {
      moduleSourceOverrides: {
        "src/courseSave.ts": "export const a = 1;",
        "src/catalog.ts": "export const b = 2;",
      },
    });
    const base = createCombinedGraphChunkHash(bag);
    const touched = createCombinedGraphChunkHash({
      ...bag,
      moduleSources: {
        ...bag.moduleSources,
        "src/catalog.ts": "export const b = 3;",
      },
    });
    expect(touched).not.toBe(base);
  });

});
