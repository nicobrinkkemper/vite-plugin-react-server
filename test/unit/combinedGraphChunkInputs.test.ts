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

  it("client-ref bag is facade-only even when the chunk lists extra modules", () => {
    // Static preserveModules:false can pull deps into a .client. facade chunk;
    // naming must still match createDefaultModuleID's single-module bag.
    const facadeOnly = buildCombinedGraphChunkHashInput(root, {
      name: "Counter.client",
      facadeModuleId: "src/routes/Counter.client.tsx",
      moduleIds: ["src/routes/Counter.client.tsx"],
    }, {
      moduleSourceOverrides: {
        "src/routes/Counter.client.tsx": '"use client";\nexport const Counter = () => null;\n',
      },
    });
    const withExtras = buildCombinedGraphChunkHashInput(root, {
      name: "Counter.client",
      facadeModuleId: "src/routes/Counter.client.tsx",
      moduleIds: [
        "src/routes/Counter.client.tsx",
        "src/routes/helper.ts",
      ],
    }, {
      moduleSourceOverrides: {
        "src/routes/Counter.client.tsx": '"use client";\nexport const Counter = () => null;\n',
        "src/routes/helper.ts": "export const n = 1;",
      },
    });
    expect(createCombinedGraphChunkHash(withExtras)).not.toBe(
      createCombinedGraphChunkHash(facadeOnly)
    );
    // resolveOptions.hashChunk narrows client facades to [facade] before
    // calling this helper — simulate that narrowing:
    const narrowed = buildCombinedGraphChunkHashInput(root, {
      name: "Counter.client",
      facadeModuleId: "src/routes/Counter.client.tsx",
      moduleIds: ["src/routes/Counter.client.tsx"],
    }, {
      moduleSourceOverrides: {
        "src/routes/Counter.client.tsx": '"use client";\nexport const Counter = () => null;\n',
      },
    });
    expect(createCombinedGraphChunkHash(narrowed)).toBe(
      createCombinedGraphChunkHash(facadeOnly)
    );
  });
});
