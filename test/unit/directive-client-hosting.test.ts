import { describe, it, expect } from "vitest";
import {
  hasFileLevelClientDirective,
  sourceHasTopLevelClientDirective,
} from "react-server-loader/directives";
import { augmentClientReferenceError } from "vite-plugin-react-server/error";

describe("directive-detected client modules", () => {
  describe("hasFileLevelClientDirective (acorn-parseable sources)", () => {
    it("detects a top-of-file 'use client' directive", () => {
      expect(
        hasFileLevelClientDirective(`"use client";\nexport const x = 1;`)
      ).toBe(true);
    });

    it("tolerates a leading 'use strict' prologue", () => {
      expect(
        hasFileLevelClientDirective(
          `"use strict";\n"use client";\nexport const x = 1;`
        )
      ).toBe(true);
    });

    it("does not flag a plain server module", () => {
      expect(
        hasFileLevelClientDirective(
          `import React from "react";\nexport function Page(){ return null; }`
        )
      ).toBe(false);
    });

    it("does NOT flag the substring 'client' in an import path (robust, not naive)", () => {
      expect(
        hasFileLevelClientDirective(
          `import { createClient } from "./client/foo.js";\nexport const x = 1;`
        )
      ).toBe(false);
    });

    it("does not flag a mid-file / function-level directive as file-level", () => {
      expect(
        hasFileLevelClientDirective(
          `const a = 1;\n"use client";\nexport const x = 1;`
        )
      ).toBe(false);
    });

    it("returns false for empty/undefined input", () => {
      expect(hasFileLevelClientDirective(undefined)).toBe(false);
      expect(hasFileLevelClientDirective("")).toBe(false);
    });
  });

  describe("sourceHasTopLevelClientDirective (raw TSX, no parser)", () => {
    const tsx = `"use client";
import React from "react";
export function Counter({ start = 0 }: { start?: number }) {
  return <button onClick={() => {}}>Count {start}</button>;
}`;

    it("detects the directive in raw, untranspiled TSX", () => {
      expect(sourceHasTopLevelClientDirective(tsx)).toBe(true);
    });

    it("skips leading comments above the directive", () => {
      expect(
        sourceHasTopLevelClientDirective(
          `// a comment\n/* block */\n"use client";\nexport const x = 1;`
        )
      ).toBe(true);
    });

    it("tolerates 'use strict' above 'use client'", () => {
      expect(
        sourceHasTopLevelClientDirective(`"use strict";\n"use client";`)
      ).toBe(true);
    });

    it("is not fooled by the word 'client' in code or comments", () => {
      expect(
        sourceHasTopLevelClientDirective(
          `import { createClient } from "./client";\nexport const x = 1;`
        )
      ).toBe(false);
      expect(
        sourceHasTopLevelClientDirective(`// use client comment only? no`)
      ).toBe(false);
    });

    it("requires the directive to be the first statement", () => {
      expect(
        sourceHasTopLevelClientDirective(`const a = 1;\n"use client";`)
      ).toBe(false);
    });
  });

  describe("augmentClientReferenceError (clearer hosting errors)", () => {
    it("explains 'outside the hosted root' failures", () => {
      const original = new Error(
        "Attempted to load a Client Module outside the hosted root."
      );
      const augmented = augmentClientReferenceError(original) as Error;
      expect(augmented).toBeInstanceOf(Error);
      expect(augmented.message).toContain("not hosted");
      expect(augmented.message).toContain("vite-plugin-react-server");
      // Preserves the original message + chains the cause.
      expect(augmented.message).toContain("outside the hosted root");
      expect((augmented as { cause?: unknown }).cause).toBe(original);
    });

    it("explains missing client-output module failures", () => {
      const original = new Error(
        "Cannot find module '/proj/dist/client/components/Counter-abc123.js'"
      );
      const augmented = augmentClientReferenceError(original) as Error;
      expect(augmented.message).toContain("not emitted to the client build output");
    });

    it("passes unrelated errors through unchanged", () => {
      const original = new Error("some unrelated failure");
      expect(augmentClientReferenceError(original)).toBe(original);
    });

    it("does not double-augment", () => {
      const original = new Error("Client Module outside the hosted root");
      const once = augmentClientReferenceError(original) as Error;
      const twice = augmentClientReferenceError(once);
      expect(twice).toBe(once);
    });
  });
});
