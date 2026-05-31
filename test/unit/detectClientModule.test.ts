import { describe, it, expect } from "vitest";
import { parse } from "acorn";
import type { Program } from "acorn";
import { detectClientModule } from "vite-plugin-react-server/directives";

/**
 * Unit suite for the unified client-module detector.
 *
 * It guards every recent class of detection bug:
 *   - c1d: directive-only modules (no `.client.` suffix) recognised
 *   - hsv: cross-layer divergence between transformer / createModuleID
 *   - the predicted next bug: `"use strict"; "use client";` under any path
 *   - the legacy substring-matcher trap: `clientId` identifier or `client`
 *     in a comment must NOT trigger client classification
 */

const acornParse = (src: string): Program =>
  parse(src, {
    ecmaVersion: "latest",
    sourceType: "module",
    allowReturnOutsideFunction: true,
  }) as unknown as Program;

describe("detectClientModule (unified client-module detector)", () => {
  describe("filename pattern (no source)", () => {
    it.each([
      "components/Counter.client.tsx",
      "components/Counter.client.ts",
      "components/Counter.client.jsx",
      "components/Counter.client.js",
      "components/Counter.client.mjs",
      "components/Counter.client.cjs",
      "components/Counter.client.mts",
      "components/Counter.client.cts",
    ])("recognises %s", (moduleId) => {
      expect(detectClientModule({ moduleId })).toBe(true);
    });

    it.each([
      "components/Counter.tsx",
      "src/lib/clientId.ts", // substring "client" must NOT trigger
      "components/clientCode.tsx",
      "src/client/foo.ts", // directory named "client" must NOT trigger
      "src/page/page.tsx",
    ])("does not flag %s by filename alone", (moduleId) => {
      expect(detectClientModule({ moduleId })).toBe(false);
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
    it("returns true when filename matches even with non-directive source", () => {
      expect(
        detectClientModule({
          moduleId: "components/Counter.client.tsx",
          source: `export const x = 1;`,
        }),
      ).toBe(true);
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
