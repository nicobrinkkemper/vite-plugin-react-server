import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Builds the README's "Minimal example" exactly as a reader would: the files
 * are cut from the README's own code blocks, written to an empty project and
 * built with `vite build --app`.
 *
 * The project lives outside this repository on purpose. The example ships no
 * tsconfig.json, and a fixture inside the repo would pick up the repo's own
 * (classic JSX) one. The example's pages use JSX without importing React, so
 * whether it builds depends on the JSX mode the installed Vite ends up with.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const EXAMPLE_FILES = [
  "vite.config.ts",
  "src/routes/page.tsx",
  "src/components/Nav.tsx",
  "src/routes/props.ts",
  "src/routes/about/page.tsx",
  "src/client.tsx",
  "index.html",
];

/** The code blocks of the "Minimal example" section, keyed by the path in each block's first-line comment. */
async function readExampleFiles(): Promise<Map<string, string>> {
  const readme = await readFile(join(repoRoot, "README.md"), "utf8");
  const section = /^## Minimal example\n([\s\S]*?)^## /m.exec(readme)?.[1];
  if (!section) throw new Error("README.md has no 'Minimal example' section");
  const files = new Map<string, string>();
  const block = /^```\w+\n(?:\/\/ (\S+)|<!-- (\S+) -->)\n([\s\S]*?)^```$/gm;
  for (const [, slashPath, htmlPath, body] of section.matchAll(block)) {
    files.set((slashPath ?? htmlPath)!, body!);
  }
  return files;
}

describe("README minimal example", () => {
  let projectDir: string;
  let status: number | null;
  let output: string;

  beforeAll(async () => {
    const files = await readExampleFiles();
    expect([...files.keys()]).toEqual(EXAMPLE_FILES);

    // Real path: macOS's temp directory is a symlink, and the plugin reads
    // the project root off the path Vite was started from.
    projectDir = await realpath(
      await mkdtemp(join(tmpdir(), "vprs-readme-minimal-"))
    );
    for (const [path, body] of files) {
      await mkdir(dirname(join(projectDir, path)), { recursive: true });
      await writeFile(join(projectDir, path), body);
    }
    const pluginPackage = JSON.parse(
      await readFile(join(repoRoot, "package.json"), "utf8")
    ) as {
      dependencies: Record<string, string>;
      peerDependencies: Record<string, string>;
    };
    // What the README's install line leaves in package.json (the plugin
    // finds its own client components through this list), plus
    // "type": "module".
    await writeFile(
      join(projectDir, "package.json"),
      JSON.stringify({
        name: "readme-minimal-example",
        type: "module",
        devDependencies: {
          "vite-plugin-react-server": "*",
          ...pluginPackage.peerDependencies,
        },
      })
    );
    // The install itself: this build of the plugin, and links to the
    // packages this repo is tested with. The plugin is copied, not linked,
    // so it resolves under node_modules the way an installed package does.
    const pluginDir = join(projectDir, "node_modules/vite-plugin-react-server");
    await mkdir(pluginDir, { recursive: true });
    await cp(join(repoRoot, "package.json"), join(pluginDir, "package.json"));
    await cp(join(repoRoot, "dist"), join(pluginDir, "dist"), {
      recursive: true,
    });
    for (const dep of Object.keys({
      ...pluginPackage.dependencies,
      ...pluginPackage.peerDependencies,
    })) {
      await symlink(
        join(repoRoot, "node_modules", dep),
        join(projectDir, "node_modules", dep),
        "dir"
      );
    }

    // A reader runs `npx vite build --app` from a plain shell: without the
    // variables vitest adds to this process.
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (
        /^(NODE_OPTIONS|NODE_ENV|TEST|MODE|DEV|PROD|SSR|BASE_URL)$/.test(key) ||
        key.startsWith("VITEST")
      ) {
        delete env[key];
      }
    }
    // Through the project's own node_modules, as `npx vite` resolves it: the
    // plugin reads the project root off the path Vite was started from.
    const viteBin = join(projectDir, "node_modules/vite/bin/vite.js");
    const proc = spawnSync(process.execPath, [viteBin, "build", "--app"], {
      cwd: projectDir,
      encoding: "utf8",
      timeout: 150_000,
      env,
    });
    status = proc.status;
    output = `${proc.stdout ?? ""}\n${proc.stderr ?? ""}`;
  }, 180_000);

  afterAll(async () => {
    if (projectDir) await rm(projectDir, { recursive: true, force: true });
  });

  it("builds without the reader configuring a JSX mode", () => {
    expect(output).not.toContain("React is not defined");
    expect(status, `vite build --app failed:\n${output}`).toBe(0);
  });

  it("prerenders both pages", async () => {
    const home = await readFile(
      join(projectDir, "dist/static/index.html"),
      "utf8"
    );
    expect(home).toContain("Hello from the server");
    const about = await readFile(
      join(projectDir, "dist/static/about/index.html"),
      "utf8"
    );
    expect(about).toContain("About");
  });
});
