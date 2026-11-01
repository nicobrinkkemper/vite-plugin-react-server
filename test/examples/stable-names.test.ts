import { resolve } from "path";
import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import { setupTestProject } from "../setup.js";
import { getSharedBuild } from "./shared-build.js";
import { DEFAULT_CONFIG } from "../../dist/plugin/config/defaults.js";
import {
  browserFiles,
  buildStyles,
  emitted,
  expectReferencesResolve,
  named,
  styles,
} from "./stable-names.layout.js";

/**
 * A browser file name is safe to cache as immutable only if it always holds
 * the same bytes. Build a project twice, the second time with a change no
 * single chunk's own sources show (a client component uses another export of
 * a shared module), and check every name the two builds share. Stylesheets
 * and the files they reference get the same check.
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

  const expectSameNameSameBytes = (before: Map<string, string>, after: Map<string, string>) => {
    expect(after.size).toBeGreaterThan(0);
    for (const [name, bytes] of after) {
      if (before.has(name)) expect(bytes, name).toBe(before.get(name));
    }
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
    expectSameNameSameBytes(before, after);

    // kit.ts did not change, but the chunk holding it did: it got a new name.
    const kitChunk = (chunks: Map<string, string>) =>
      [...chunks].filter(([, code]) => code.includes("alpha") && !code.includes("function One"));
    expect(kitChunk(before).length).toBeGreaterThan(0);
    expect(kitChunk(after).map(([name]) => name)).not.toEqual(kitChunk(before).map(([name]) => name));

    // One client reference name in every output, under build.assetsDir in
    // its source directory.
    for (const build of [first, second]) {
      const named = (files: string[][], component: string) =>
        files.map(([file]) => file).filter((file) => file.includes(`${component}.client-`));
      for (const component of ["One", "Two"]) {
        const [browserFile] = [...browserFiles(build.testDir).keys()].filter((file) =>
          file.includes(`${component}.client-`)
        );
        expect(browserFile, component).toMatch(
          new RegExp(`^${DEFAULT_CONFIG.BUILD.assetsDir}/components/${component}\\.client-[^/]+\\.js$`)
        );
        expect(named(build.clientFiles(), component)).toContain(browserFile);
        expect(named(build.serverFiles(), component)).toContain(browserFile);
      }
    }
  });

  // The fixture: see stable-names.layout.ts.
  const { themeCss, heroPng, bodyFont } = emitted(DEFAULT_CONFIG.BUILD.assetsDir);

  it("names stylesheets and the files they reference by their bytes, and every output uses the browser's names", async () => {
    const base = await buildStyles(styles);
    const edits = {
      // The same sources again, in another directory.
      none: await buildStyles({ ...styles, build: "again" }),
      // A direct edit to the stylesheet the page imports.
      theme: await buildStyles({ ...styles, theme: "blue" }),
      // An edit to the stylesheet it @imports.
      base: await buildStyles({ ...styles, base: "1px" }),
      // New bytes for the image it url()s.
      image: await buildStyles({ ...styles, image: 2 }),
      // New bytes for the font it @font-faces.
      font: await buildStyles({ ...styles, font: 2 }),
    };

    const before = browserFiles(base.testDir);
    expect([...before.keys()]).not.toContain("version.txt");
    for (const [edit, build] of Object.entries(edits)) {
      const after = browserFiles(build.testDir);
      expectSameNameSameBytes(before, after);
      if (edit === "none") {
        expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
        continue;
      }
      // Each edit lands in theme.css's bytes, so it takes a new name.
      expect(named(after, themeCss), edit).not.toBe(named(before, themeCss));
    }

    // The check fails when a name keeps its URL and changes its bytes.
    const regressed = new Map(before);
    regressed.set(named(before, themeCss), ".hero{color:blue}");
    expect(() => expectSameNameSameBytes(before, regressed)).toThrow(/theme-/);
    const image = browserFiles(edits.image.testDir);
    expect(named(image, heroPng)).not.toBe(named(before, heroPng));
    expect(image.get(named(image, themeCss))).toContain(named(image, heroPng));
    const font = browserFiles(edits.font.testDir);
    expect(named(font, bodyFont)).not.toBe(named(before, bodyFont));
    expect(named(font, heroPng)).toBe(named(before, heroPng));

    const names = emitted(DEFAULT_CONFIG.BUILD.assetsDir);
    for (const build of [base, ...Object.values(edits)]) expectReferencesResolve(build, names);
  });
});
