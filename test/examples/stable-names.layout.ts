import { join, relative, resolve } from "path";
import { expect } from "vitest";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { setupTestProject } from "../setup.js";
import { testUserOptions } from "../test-config.js";
import { getSharedBuild, type SharedBuildResult } from "./shared-build.js";
import { getCondition } from "../../dist/plugin/config/getCondition.js";

/**
 * The layout of a build's browser files, shared by the stable-names tests.
 *
 * One rule names every generated browser file:
 * `<assetsDir>/<source dir, moduleBase stripped>/<name>-<hash>.<ext>`.
 *
 * The page imports theme.css, which @imports base.css, url()s hero.png and
 * a font under fonts/; with `url: true` the page also imports hero.png with
 * `?url`. The image and the font are over Vite's inline limit, so each is a
 * file of its own. public/version.txt keeps its path and changes with every
 * build.
 */
export type Styles = { theme: string; base: string; image: number; font: number; build?: string };
export const styles: Styles = { theme: "red", base: "0", image: 1, font: 1 };

export const setupStyles = (s: Styles, url = false) => async (testDir: string) => {
  await setupTestProject(testDir);
  await mkdir(resolve(testDir, "src/page/fonts"), { recursive: true });
  await writeFile(resolve(testDir, "src/page/base.css"), `.base { margin: ${s.base} }\n`);
  await writeFile(
    resolve(testDir, "src/page/theme.css"),
    `@import "./base.css";\n@font-face { font-family: Body; src: url("./fonts/body.woff2") }\n.hero { color: ${s.theme}; background: url("./hero.png") }\n`
  );
  await writeFile(resolve(testDir, "src/page/hero.png"), Buffer.alloc(6000, s.image));
  await writeFile(resolve(testDir, "src/page/fonts/body.woff2"), Buffer.alloc(8192, s.font));
  await mkdir(resolve(testDir, "public"), { recursive: true });
  await writeFile(resolve(testDir, "public/version.txt"), JSON.stringify(s));
  const page = await readFile(resolve(testDir, "src/page/page.tsx"), "utf8");
  const marker = `<span className={styles.shared}>Page</span>`;
  if (!page.includes(marker)) throw new Error("page.tsx fixture changed; update the marker");
  await writeFile(
    resolve(testDir, "src/page/page.tsx"),
    url
      ? `import "./theme.css";\nimport heroUrl from "./hero.png?url";\n` +
          page.replace(marker, `<img src={heroUrl} alt="" />${marker}`)
      : `import "./theme.css";\n${page}`
  );
};

/**
 * Build the styles fixture. The fixture cache keys on the setup's source, not
 * the values it closes over, so the values name the fixture. A `build`
 * option replaces the harness's composed one wholesale, so when assetsDir is
 * given it carries the per-condition outDir the harness would have set.
 */
export const buildStyles = (s: Styles, { url = false, assetsDir }: { url?: boolean; assetsDir?: string } = {}) => {
  const name = ["stable-names-css", s.theme, s.base, s.image, s.font, s.build]
    .concat(url ? ["url"] : [])
    .concat(assetsDir === undefined ? [] : ["assetsDir", assetsDir || "none"])
    .filter(Boolean)
    .join("-");
  const build =
    assetsDir === undefined
      ? {}
      : {
          build: {
            ...testUserOptions.build,
            assetsDir,
            outDir: testUserOptions.build.outDir + getCondition(`-${name}-`),
          },
        };
  return getSharedBuild(name, name, { setupProject: setupStyles(s, url), ...build });
};

/**
 * Every hashed file this condition's browser build wrote
 * (dist-…-<condition>/static), by name. Pages, the manifest and public/
 * files keep fixed paths and are revalidated, not cached as immutable.
 */
export const browserFiles = (testDir: string) => {
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

/** The browser file a build emitted for a source, by its name and extension. */
export const named = (files: Map<string, string>, pattern: RegExp) => {
  const matches = [...files.keys()].filter((file) => pattern.test(file));
  expect(matches, String(pattern)).toHaveLength(1);
  return matches[0];
};

/** The names the rule gives this fixture's files under an assetsDir. */
export const emitted = (assetsDir: string) => {
  const at = (path: string) => new RegExp(`^${assetsDir ? assetsDir + "/" : ""}${path}$`);
  return {
    linkJs: at("components/Link\\.client-[^/]+\\.js"),
    themeCss: at("page/theme-[^/]+\\.css"),
    heroPng: at("page/hero-[^/]+\\.png"),
    bodyFont: at("page/fonts/body-[^/]+\\.woff2"),
  };
};

/**
 * Every stylesheet, image or font a build's pages, flight payloads, client
 * and server builds name is a file the browser build wrote, and the
 * stylesheet's bytes name the image and the font beside it.
 *
 * Pages and flight payloads are rendered through process-wide plugin state,
 * so in a test process that builds several projects they are only
 * trustworthy for the first build of a page module; a file that checks the
 * `?url` import rendered into them builds one project.
 */
export const expectReferencesResolve = (
  build: SharedBuildResult,
  names: ReturnType<typeof emitted>,
  { url = false } = {}
) => {
  const files = browserFiles(build.testDir);
  const referenced = new Set<string>();
  const collect = (text: string) => {
    for (const [ref] of text.matchAll(/[\w./-]+\.(?:css|png|woff2)\b/g)) {
      if (/-[a-z0-9]+\.(css|png|woff2)$/.test(ref)) referenced.add(ref.replace(/^\//, ""));
    }
  };
  for (const [, content] of [...build.htmlFiles(), ...build.rscFiles()]) collect(String(content));
  for (const [file, content] of [...build.clientFiles(), ...build.serverFiles()]) {
    collect(file);
    collect(content);
  }
  expect([...referenced].filter((ref) => names.themeCss.test(ref))).not.toHaveLength(0);
  for (const ref of referenced) expect(files.has(ref), ref).toBe(true);

  const hero = named(files, names.heroPng);
  const theme = files.get(named(files, names.themeCss))!;
  expect(theme).toContain(hero);
  expect(theme).toContain(named(files, names.bodyFont));
  named(files, names.linkJs);
  if (url) {
    // The page's `?url` import and the stylesheet's `url()` name one file.
    const html = build.htmlFiles().map(([, content]) => String(content)).join("\n");
    expect(html).toContain(`<img src="/${hero}"`);
  }
};

/** One build of the fixture under an assetsDir: every generated file follows the rule. */
export const expectLayout = async (assetsDir: string | undefined, expectedDir: string) => {
  const build = await buildStyles(styles, { url: true, assetsDir });
  const files = browserFiles(build.testDir);
  expectReferencesResolve(build, emitted(expectedDir), { url: true });
  for (const file of files.keys()) {
    expect(file).not.toMatch(/^\/|\/\//);
    if (expectedDir) expect(file, expectedDir).toMatch(new RegExp(`^${expectedDir}/`));
    else expect(file).not.toMatch(/^assets\//);
  }
};
