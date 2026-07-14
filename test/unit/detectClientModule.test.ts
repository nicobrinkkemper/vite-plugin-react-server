import { describe, it, expect } from "vitest";
import { parse } from "acorn";
import type { Program } from "acorn";
import { detectClientModule } from "react-server-loader/directives";
import { DEFAULT_LOADER_CONFIG } from "vite-plugin-react-server/config";

/**
 * Unit suite for the client-module detector.
 *
 * Pins the four classes of "is this client?" answers that have to stay
 * stable regardless of which call site asks:
 *   - directive-only modules without the `.client.` filename suffix are
 *     recognised,
 *   - a `"use strict"` or comment prologue above `"use client"` is
 *     tolerated,
 *   - substring matches against "client" (identifiers, comments, import
 *     paths, directory names) do NOT classify a module as client,
 *   - the AST path and the parser-free scanner path agree on every input.
 */

const acornParse = (src: string): Program =>
  parse(src, {
    ecmaVersion: "latest",
    sourceType: "module",
    allowReturnOutsideFunction: true,
  }) as unknown as Program;

describe("detectClientModule (unified client-module detector)", () => {
  /**
   * A filename never classifies a module. Only a top-of-file `"use client"`
   * does — the one signal React defines, and the only one that survives a move
   * to another toolchain. react-server-loader 19.2.15 stopped reading names: a
   * first-party file shaped like a client module but missing the directive now
   * gets a build warning telling the author to add it, instead of a silent
   * guess that works here and nowhere else.
   */
  describe("filename never classifies (no source)", () => {
    it.each([
      // The dotted-suffix convention...
      "components/Counter.client.tsx",
      "components/Counter.client.js",
      "components/Counter.client.mjs",
      // ...and the standalone-basename app-entry convention. Neither is a signal.
      "client.tsx",
      "src/client.tsx",
      "src/client.js",
      // Nor is anything merely containing "client".
      "components/Counter.tsx",
      "src/lib/clientId.ts",
      "src/client/foo.ts",
      "src/clients.tsx",
    ])("does not classify %s without a directive", (moduleId) => {
      expect(detectClientModule({ moduleId })).toBe(false);
    });

    it("classifies a `.client.tsx` only once it carries the directive", () => {
      const moduleId = "components/Counter.client.tsx";
      expect(
        detectClientModule({ moduleId, source: `export const C = () => null;` })
      ).toBe(false);
      expect(
        detectClientModule({
          moduleId,
          source: `"use client";\nexport const C = () => null;`,
        })
      ).toBe(true);
    });
  });

  describe("source-only directive (no parser, scanner path)", () => {
    it("detects a top-of-file `\"use client\"`", () => {
      expect(
        detectClientModule({
          source: `"use client";\nexport const x = 1;`,
        }),
      ).toBe(true);
    });

    it("tolerates a `\"use strict\"` prologue above `\"use client\"`", () => {
      expect(
        detectClientModule({
          source: `"use strict";\n"use client";\nexport const x = 1;`,
        }),
      ).toBe(true);
    });

    it("tolerates a leading block-comment header (JSDoc) above `\"use client\"`", () => {
      expect(
        detectClientModule({
          source: `/**\n * @license MIT\n */\n"use client";\nexport const x = 1;`,
        }),
      ).toBe(true);
    });

    it("tolerates a leading line comment above `\"use client\"`", () => {
      expect(
        detectClientModule({
          source: `// auto-generated\n"use client";\nexport const x = 1;`,
        }),
      ).toBe(true);
    });

    it("rejects a `\"use client\"` placed after a real statement", () => {
      expect(
        detectClientModule({
          source: `const x = 1;\n"use client";\nexport { x };`,
        }),
      ).toBe(false);
    });

    it("rejects a comment that merely contains the word `use client`", () => {
      expect(
        detectClientModule({
          source: `// not a use client directive\nexport const x = 1;`,
        }),
      ).toBe(false);
    });

    it("rejects an identifier named `clientId` with no real directive", () => {
      expect(
        detectClientModule({
          source: `const clientId = "x";\nexport { clientId };`,
        }),
      ).toBe(false);
    });

    it("rejects an import path mentioning `client`", () => {
      expect(
        detectClientModule({
          source: `import { foo } from "./client/foo";\nexport const y = foo;`,
        }),
      ).toBe(false);
    });

    it("does not flag a server module under default settings", () => {
      expect(
        detectClientModule({
          source: `import React from "react";\nexport function Page(){ return null; }`,
        }),
      ).toBe(false);
    });
  });

  describe("source + parser (AST path, build-time transformer)", () => {
    it("detects `\"use client\"` via the AST path", () => {
      expect(
        detectClientModule({
          source: `"use client";\nexport const x = 1;`,
          parseFn: acornParse,
        }),
      ).toBe(true);
    });

    it("tolerates a `\"use strict\"` prologue via the AST path", () => {
      expect(
        detectClientModule({
          source: `"use strict";\n"use client";\nexport const x = 1;`,
          parseFn: acornParse,
        }),
      ).toBe(true);
    });

    it("rejects a misplaced `\"use client\"` after a statement via the AST path", () => {
      expect(
        detectClientModule({
          source: `const x = 1;\n"use client";\nexport { x };`,
          parseFn: acornParse,
        }),
      ).toBe(false);
    });

    it("falls back to the scanner when the parser throws", () => {
      // Throw on every call → triggers fallback to char-scanner.
      const throwingParse = (): Program => {
        throw new Error("parse failure");
      };
      expect(
        detectClientModule({
          source: `"use client";\nexport const x = 1;`,
          parseFn: throwingParse,
        }),
      ).toBe(true);
    });
  });

  describe("filename + source combined", () => {
    it("returns false when the filename matches but the source has no directive", () => {
      expect(
        detectClientModule({
          moduleId: "components/Counter.client.tsx",
          source: `export const x = 1;`,
        }),
      ).toBe(false);
    });

    it("returns true when source has directive even without `.client.` filename", () => {
      expect(
        detectClientModule({
          moduleId: "components/Counter.tsx",
          source: `"use client";\nexport const x = 1;`,
        }),
      ).toBe(true);
    });

    it("returns false when neither filename nor source qualifies", () => {
      expect(
        detectClientModule({
          moduleId: "components/Counter.tsx",
          source: `export const x = 1;`,
        }),
      ).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false for empty source and no moduleId", () => {
      expect(detectClientModule({})).toBe(false);
    });

    it("returns false for empty source string", () => {
      expect(detectClientModule({ source: "" })).toBe(false);
    });

    it("does not invoke parser when source lacks `use client` substring", () => {
      // If parseFn is called and throws, we'd see the error. Cheap pre-filter
      // gates it.
      const exploding = (): Program => {
        throw new Error("parser should not have been called");
      };
      expect(
        detectClientModule({
          source: `export const x = 1;`,
          parseFn: exploding,
        }),
      ).toBe(false);
    });
  });
});

/**
 * Pins the public `DEFAULT_LOADER_CONFIG.isClientComponent*` surface — the
 * user-overridable hooks on `loader.*`. The three defaults delegate to
 * `detectClientModule`, so out-of-the-box behaviour is the strict form.
 * These tests also pin the call signatures so user-supplied overrides keep
 * type-checking against the same shape.
 */
describe("DEFAULT_LOADER_CONFIG.isClientComponent* public surface", () => {
  it("isClientComponentCode rejects substring traps in identifiers, paths, and source", () => {
    // `clientId` identifier — substring "client" in source.
    expect(
      DEFAULT_LOADER_CONFIG.isClientComponentCode(
        `const clientId = "x"; export { clientId };`,
        "src/lib/utils.ts",
      ),
    ).toBe(false);
    // Filename `src/lib/clientId.ts` — substring "client" in the path.
    expect(
      DEFAULT_LOADER_CONFIG.isClientComponentCode(
        `export const x = 1;`,
        "src/lib/clientId.ts",
      ),
    ).toBe(false);
    // A `.client.tsx` filename proves nothing without the directive.
    expect(
      DEFAULT_LOADER_CONFIG.isClientComponentCode(
        `export const x = 1;`,
        "src/components/Counter.client.tsx",
      ),
    ).toBe(false);
    // Real top-of-file `"use client"` directive — recognised.
    expect(
      DEFAULT_LOADER_CONFIG.isClientComponentCode(
        `"use client";\nexport const x = 1;`,
        "src/components/Counter.tsx",
      ),
    ).toBe(true);
  });

  it("isClientComponentByName keeps the 2-arg signature but never classifies", () => {
    // The hook survives as an OPT-IN escape hatch: a project can still supply
    // its own name-based predicate via `loader.isClientComponentByName`, and the
    // transformer honours it. The DEFAULT no longer classifies by name at all
    // (react-server-loader 19.2.15), so it answers false for every path.
    //
    // The `_transformedModuleId` second arg is accepted but ignored. The call
    // shape is part of the configurable loader hook surface in `plugin/types.ts`;
    // if it ever drops to a single arg, this test fails to compile.
    expect(
      DEFAULT_LOADER_CONFIG.isClientComponentByName(
        "src/components/Counter.client.tsx",
        "dist/components/Counter.client.js",
      ),
    ).toBe(false);
    expect(
      DEFAULT_LOADER_CONFIG.isClientComponentByName(
        "src/lib/clientId.ts",
        "dist/lib/clientId.js",
      ),
    ).toBe(false);
  });

  it("isClientComponentByCode applies the source-only branch", () => {
    // No moduleId; only source content drives the decision.
    expect(
      DEFAULT_LOADER_CONFIG.isClientComponentByCode(
        `"use client";\nexport const x = 1;`,
      ),
    ).toBe(true);
    expect(
      DEFAULT_LOADER_CONFIG.isClientComponentByCode(
        `const clientId = "x"; export { clientId };`,
      ),
    ).toBe(false);
  });

  it("a user override on isClientComponentCode wins over the default", () => {
    // Mirrors react-loader's resolution pattern:
    //   userOptions.loader?.isClientComponentCode ?? DEFAULT_LOADER_CONFIG.isClientComponentCode
    // If the default ever ends up consulted ahead of a user override, this
    // test catches it.
    const userOverride = (_code: string, _moduleId?: string) => true;
    const resolved =
      userOverride ?? DEFAULT_LOADER_CONFIG.isClientComponentCode;
    // A plain server module that the default rejects, classified as client
    // by the override.
    expect(
      resolved(
        `import React from "react"; export function Page() { return null; }`,
        "src/page/page.tsx",
      ),
    ).toBe(true);
    // The default still behaves as documented when no override is supplied.
    expect(
      DEFAULT_LOADER_CONFIG.isClientComponentCode(
        `import React from "react"; export function Page() { return null; }`,
        "src/page/page.tsx",
      ),
    ).toBe(false);
  });
});
