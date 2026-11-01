import { join, relative, resolve } from "path";
import { describe, it, expect } from "vitest";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { setupTestProject } from "../setup.js";
import { getSharedBuild, type SharedBuildResult } from "./shared-build.js";
import { getCondition } from "../../dist/plugin/config/getCondition.js";

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

  // Every hashed file this condition's browser build wrote
  // (dist-…-<condition>/static), by name. Pages, the manifest and public/
  // files keep fixed paths and are revalidated, not cached as immutable.
  const browserFiles = (testDir: string) => {
    const files = new Map<string, string>();
    const own = (d: string) => d.startsWith("dist") && d.endsWith(getCondition("-"));
    const publicDir = join(testDir, "public");
    const fixedPath = (name: string) =>
      /\.(html|rsc)$/.test(name) || existsSync(join(publicDir, name));
    for (const dist of readdirSync(testDir).filter(own)) {
      const root = join(testDir, dist, "static");
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const path = join(dir, entry);
          const name = relative(root, path);
          if (statSync(path).isDirectory()) {
            if (entry !== ".vite") walk(path);
          } else if (!fixedPath(name)) {
            files.set(name, readFileSync(path, "latin1"));
          }
        }
      };
      walk(root);
    }
    return files;
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
  // The page imports theme.css, which @imports base.css and url()s hero.png.
  // The image is over Vite's inline limit, so it is a file of its own.
  // public/version.txt keeps its path and changes with every build.
  type Styles = { theme: string; base: string; image: number; build?: string };
  const styles: Styles = { theme: "red", base: "0", image: 1 };
  const setupStyles = (s: Styles) => async (testDir: string) => {
    await setupTestProject(testDir);
    await writeFile(resolve(testDir, "src/page/base.css"), `.base { margin: ${s.base} }\n`);
    await writeFile(
      resolve(testDir, "src/page/theme.css"),
      `@import "./base.css";\n.hero { color: ${s.theme}; background: url("./hero.png") }\n`
    );
    await writeFile(resolve(testDir, "src/page/hero.png"), Buffer.alloc(6000, s.image));
    await mkdir(resolve(testDir, "public"), { recursive: true });
    await writeFile(resolve(testDir, "public/version.txt"), JSON.stringify(s));
    const page = await readFile(resolve(testDir, "src/page/page.tsx"), "utf8");
    await writeFile(resolve(testDir, "src/page/page.tsx"), `import "./theme.css";\n${page}`);
  };
  // The fixture cache keys on the setup's source, not the values it closes
  // over, so the values name the fixture.
  const buildStyles = (s: Styles) => {
    const name = ["stable-names-css", s.theme, s.base, s.image, s.build].filter(Boolean).join("-");
    return getSharedBuild(name, name, { setupProject: setupStyles(s) });
  };

  // The browser file a build emitted for a source, by its name and extension.
  const named = (files: Map<string, string>, pattern: RegExp) => {
    const matches = [...files.keys()].filter((file) => pattern.test(file));
    expect(matches, String(pattern)).toHaveLength(1);
    return matches[0];
  };
  const themeCss = /(^|\/)theme-[^/]+\.css$/;
  const heroPng = /(^|\/)hero-[^/]+\.png$/;

  // Every stylesheet or image a build's pages, flight payloads and server
  // builds name is a file the browser build wrote.
  const expectReferencesResolve = (build: SharedBuildResult) => {
    const files = browserFiles(build.testDir);
    const referenced = new Set<string>();
    const collect = (text: string) => {
      for (const [ref] of text.matchAll(/[\w./-]+\.(?:css|png)\b/g)) {
        if (/-[a-z0-9]+\.(css|png)$/.test(ref)) referenced.add(ref.replace(/^\//, ""));
      }
    };
    for (const [, content] of [...build.htmlFiles(), ...build.rscFiles()]) collect(String(content));
    for (const [file, content] of [...build.clientFiles(), ...build.serverFiles()]) {
      collect(file);
      collect(content);
    }
    expect([...referenced].filter((ref) => themeCss.test(ref))).not.toHaveLength(0);
    for (const ref of referenced) expect(files.has(ref), ref).toBe(true);
  };

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

    for (const build of [base, ...Object.values(edits)]) expectReferencesResolve(build);
  });
});
