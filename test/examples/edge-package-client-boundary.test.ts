import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { doBuild } from "../doBuild.js";

const testDir = resolve(
  __dirname,
  "../fixtures/edge-package-client-boundary.test"
);

// A SERVER page importing a PACKAGE module that carries "use client"
// (router/client's Link), under a hoisted install: the plugin resolves
// outside the fixture's project root — the repo's own layout, and any
// pnpm/monorepo consumer. preserveModules can't host the barrel's chunk
// cluster there, so the build must fail loudly with the fix named
// (first-party *.client.tsx wrapper, or install at the project root) rather
// than dangle to a runtime ERR_MODULE_NOT_FOUND — or worse, statically bake
// the barrel into dist/server-edge, where the vendored CJS flight client's
// interop (`import { createRequire } from "node:module"`) fails a fetch
// runtime's validator at deploy while every Node-based check stays green.
// The root-install variant of that silent bake needs a pack-and-install
// fixture and is tracked separately.
async function setupFixture() {
  await mkdir(join(testDir, "src/page"), { recursive: true });
  await writeFile(
    join(testDir, "src/page/page.tsx"),
    `import { Link } from "vite-plugin-react-server/router/client";\n` +
      `export const Page = ({ name }: { name: string }) => (\n` +
      `  <div id="root">Hello {name} <Link to="/">home</Link></div>\n` +
      `);`
  );
  await writeFile(
    join(testDir, "src/page/props.ts"),
    `export const props = (_url: string) => ({ name: "boundary" });`
  );
  await writeFile(
    join(testDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
      },
      include: ["src"],
    })
  );
  await writeFile(
    join(testDir, "index.html"),
    `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body><div id="root"></div><script type="module" src="/src/client.tsx"></script></body></html>`
  );
  await writeFile(
    join(testDir, "src/client.tsx"),
    `import { startClient } from "vite-plugin-react-server/router/client";\n` +
      `startClient({ patterns: ["/"] });`
  );
  try {
    await symlink(
      resolve(__dirname, "../../node_modules"),
      join(testDir, "node_modules"),
      "dir"
    );
  } catch {}
}

describe("server page importing the package client barrel (hoisted install)", () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await setupFixture();
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("fails the build loudly and names the fix", async () => {
    await expect(
      doBuild({
        projectRoot: testDir,
        moduleBase: "src",
        Page: "src/page/page.tsx",
        props: "src/page/props.ts",
        transport: "webpack",
        build: {
          pages: ["/"],
          outDir: "dist",
          edge: true,
        },
      } as any)
    ).rejects.toThrow(/router client barrel[\s\S]*\*\.client\.tsx/);
  });
});
