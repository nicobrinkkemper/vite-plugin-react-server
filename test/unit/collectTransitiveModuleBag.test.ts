import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  collectTransitiveModuleBag,
  collectTransitiveModuleBagFromEntry,
  resolveFirstPartyImport,
} from "vite-plugin-react-server/config";
import { createCombinedGraphChunkHash } from "vite-plugin-react-server/config";

/**
 * Guards fpm9.2: the naming bag must follow relative first-party imports so
 * (1) bundled helpers change a client-ref hash and (2) separate-chunk helpers
 * also invalidate the importer — without hashing final filenames.
 */
describe("collectTransitiveModuleBag", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "vprs-transitive-bag-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function write(rel: string, body: string) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }

  it("resolves extensionless relative imports to .ts/.tsx", () => {
    write("src/a.tsx", 'export const a = 1;\n');
    expect(resolveFirstPartyImport(root, "src/b.tsx", "./a")).toBe("src/a.tsx");
  });

  it("includes a relative helper in the facade bag (bundled-dep case)", () => {
    write(
      "src/Counter.client.tsx",
      `"use client";\nimport { n } from "./helper";\nexport const Counter = () => n;\n`
    );
    write("src/helper.ts", "export const n = 1;\n");

    const bag = collectTransitiveModuleBagFromEntry(
      root,
      "src/Counter.client.tsx"
    );
    expect(bag.moduleIds).toEqual(["src/Counter.client.tsx", "src/helper.ts"]);

    const base = createCombinedGraphChunkHash({
      ...bag,
      importedChunkNames: [],
    });
    write("src/helper.ts", "export const n = 2;\n");
    const next = createCombinedGraphChunkHash({
      ...collectTransitiveModuleBagFromEntry(root, "src/Counter.client.tsx"),
      importedChunkNames: [],
    });
    expect(next).not.toBe(base);
  });

  it("importer bag changes when a separate-chunk dep source changes", () => {
    // Same graph walk whether Rollup emits helper as its own chunk or not —
    // the importer hashes helper's source, not helper's filename.
    write(
      "src/bridge.ts",
      `import { save } from "./courseSave";\nexport const bridge = save;\n`
    );
    write("src/courseSave.ts", "export const save = () => 1;\n");

    const before = createCombinedGraphChunkHash({
      ...collectTransitiveModuleBag(root, ["src/bridge.ts"]),
      importedChunkNames: [],
    });
    write("src/courseSave.ts", "export const save = () => 2;\n");
    const after = createCombinedGraphChunkHash({
      ...collectTransitiveModuleBag(root, ["src/bridge.ts"]),
      importedChunkNames: [],
    });
    expect(after).not.toBe(before);
  });

  it("skips bare package imports and node_modules", () => {
    write(
      "src/widget.tsx",
      `import React from "react";\nimport { x } from "./local";\nexport const W = () => x;\n`
    );
    write("src/local.ts", "export const x = 1;\n");
    mkdirSync(join(root, "node_modules/pkg"), { recursive: true });
    write("node_modules/pkg/index.js", "export const p = 1;\n");

    const bag = collectTransitiveModuleBagFromEntry(root, "src/widget.tsx");
    expect(bag.moduleIds).toEqual(["src/local.ts", "src/widget.tsx"]);
  });

  it("is stable under import order and ignores cycles", () => {
    write("src/a.ts", `import { b } from "./b";\nexport const a = b;\n`);
    write("src/b.ts", `import { a } from "./a";\nexport const b = a;\n`);
    const one = collectTransitiveModuleBag(root, ["src/a.ts"]);
    const two = collectTransitiveModuleBag(root, ["src/b.ts", "src/a.ts"]);
    expect(one.moduleIds).toEqual(["src/a.ts", "src/b.ts"]);
    expect(two.moduleIds).toEqual(one.moduleIds);
  });
});
