import { join, relative, resolve } from "path";
import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import { readdirSync, readFileSync, statSync } from "fs";
import { setupTestProject } from "../setup.js";
import { getSharedBuild } from "./shared-build.js";

/**
 * A browser file name is safe to cache as immutable only if it always holds
 * the same bytes. Build a project twice, the second time with a change no
 * single chunk's own sources show (a client component uses another export of
 * a shared module), and check every name the two builds share.
 */
describe("browser file names: same name, same bytes", () => {
  const kit = `export const a = () => "alpha";
export const b = () => "bravo";
export const c = () => "charlie";
`;
  const setup = (export_: "b" | "c") => async (testDir: string) => {
    await setupTestProject(testDir);
    await mkdir(resolve(testDir, "src/components"), { recursive: true });
    await writeFile(resolve(testDir, "src/components/kit.ts"), kit);
    await writeFile(
      resolve(testDir, "src/components/One.client.tsx"),
      `"use client";
import React from "react";
import { a } from "./kit.js";
export function One() { return <p>{a()}</p>; }
`
    );
    await writeFile(
      resolve(testDir, "src/components/Two.client.tsx"),
      `"use client";
import React from "react";
import { ${export_} } from "./kit.js";
export function Two() { return <p>{${export_}()}</p>; }
`
    );
  };

  // Every .js the browser build wrote (dist-…/static), by name.
  const browserFiles = (testDir: string) => {
    const files = new Map<string, string>();
    for (const dist of readdirSync(testDir).filter((d) => d.startsWith("dist"))) {
      const root = join(testDir, dist, "static");
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const path = join(dir, entry);
          if (statSync(path).isDirectory()) walk(path);
          else if (entry.endsWith(".js")) files.set(relative(root, path), readFileSync(path, "utf8"));
        }
      };
      walk(root);
    }
    return files;
  };

  it("renames exactly the files whose bytes changed, and SSR/RSC use the browser's names", async () => {
    const first = await getSharedBuild("stable-names-b", "stable-names-b", {
      setupProject: setup("b"),
      pages: [],
    });
    const second = await getSharedBuild("stable-names-c", "stable-names-c", {
      setupProject: setup("c"),
      pages: [],
    });

    const before = browserFiles(first.testDir);
    const after = browserFiles(second.testDir);
    expect(after.size).toBeGreaterThan(0);
    for (const [name, code] of after) {
      if (before.has(name)) expect(code, name).toBe(before.get(name));
    }

    // kit.ts did not change, but the chunk holding it did: it got a new name.
    const kitChunk = (chunks: Map<string, string>) =>
      [...chunks].filter(([, code]) => code.includes("alpha") && !code.includes("function One"));
    expect(kitChunk(before).length).toBeGreaterThan(0);
    expect(kitChunk(after).map(([name]) => name)).not.toEqual(kitChunk(before).map(([name]) => name));

    // One client reference name in every output.
    for (const build of [first, second]) {
      const named = (files: string[][], component: string) =>
        files.map(([file]) => file).filter((file) => file.includes(`${component}.client-`));
      for (const component of ["One", "Two"]) {
        const [browserFile] = [...browserFiles(build.testDir).keys()].filter((file) =>
          file.includes(`${component}.client-`)
        );
        expect(browserFile, component).toBeTruthy();
        expect(named(build.clientFiles(), component)).toContain(browserFile);
        expect(named(build.serverFiles(), component)).toContain(browserFile);
      }
    }
  });
});
