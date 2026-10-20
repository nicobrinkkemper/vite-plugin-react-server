import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ConfigEnv } from "vite";
import { rollup } from "rollup";
import { testUserOptions } from "../test-config.js";
import {
  resolveOptions,
  resolveUserConfig,
  createRollupLikeHash,
  createDefaultModuleID,
} from "vite-plugin-react-server/config";

/**
 * fpm9.3 — acceptance pins for browser chunk naming.
 *
 * Three cases must stay green in CI, and each must assert the pre-fix
 * failure mode (hash the Rollup name, or hash the facade source alone)
 * would leave the suffix unchanged while the combined-graph wiring busts it.
 */
describe("combined-graph chunk naming (fpm9.3)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "vprs-fpm9-naming-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function write(rel: string, body: string) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }

  const emptyDiscovery = {
    clientInputs: {},
    serverInputs: {},
    staticManifest: {},
    staticInputs: {},
    workerPaths: {},
    serverEntry: null,
    clientEntry: {},
    serverActions: {},
    propsMap: new Map(),
    pageMap: new Map(),
    rootMap: new Map(),
    htmlMap: new Map(),
    routeMap: new Map(),
    urlMap: new Map(),
    errors: [],
  };

  function userOptions() {
    const result = resolveOptions(
      { ...testUserOptions, projectRoot: root },
      true
    );
    if (result.type !== "success" || !result.userOptions) {
      throw new Error("resolveOptions failed");
    }
    return result.userOptions;
  }

  function clientChunkFileNames() {
    const result = resolveUserConfig({
      forceResolve: true,
      condition: "react-client",
      config: { build: { ssr: false } },
      configEnv: { command: "build", mode: "production", isSsrBuild: false },
      userOptions: userOptions(),
      autoDiscoveredFiles: emptyDiscovery,
    });
    if (result.type !== "success") throw result.error;
    const output = result.userConfig.build.rollupOptions!.output!;
    const out = (Array.isArray(output) ? output[output.length - 1] : output) as {
      chunkFileNames: (info: unknown) => string;
      entryFileNames: (info: unknown) => string;
    };
    return out;
  }

  function hashSuffix(fileName: string): string {
    const base = fileName.split("/").pop() ?? fileName;
    const match = base.match(/-([A-Za-z0-9]+)\.js$/);
    if (!match) {
      throw new Error(`expected hashed .js name, got ${fileName}`);
    }
    return match[1];
  }

  it("shared chunk with no facade: content change busts the name (name-only hash would not)", () => {
    write("src/courseSave.ts", "export const save = () => 1;\n");
    write("src/catalog.ts", "export const catalog = [];\n");
    write("src/bindings.ts", "export const bindings = {};\n");

    const moduleIds = [
      join(root, "src/courseSave.ts"),
      join(root, "src/catalog.ts"),
      join(root, "src/bindings.ts"),
    ];
    const sharedChunk = {
      type: "chunk" as const,
      name: "courseSave",
      facadeModuleId: null,
      isEntry: false,
      isDynamicEntry: false,
      exports: [] as string[],
      moduleIds,
    };

    const before = clientChunkFileNames().chunkFileNames(sharedChunk);
    const beforeSuffix = hashSuffix(before);

    // Pre-fix: hashing the Rollup name alone never changes with content.
    const nameOnlyHash = createRollupLikeHash("courseSave");
    expect(existsSync(join(root, sharedChunk.name))).toBe(false);
    expect(beforeSuffix).not.toBe(nameOnlyHash);

    write("src/catalog.ts", "export const catalog = ['changed'];\n");
    const after = clientChunkFileNames().chunkFileNames(sharedChunk);
    const afterSuffix = hashSuffix(after);

    expect(afterSuffix).not.toBe(beforeSuffix);
    expect(createRollupLikeHash("courseSave")).toBe(nameOnlyHash);
    expect(afterSuffix).not.toBe(nameOnlyHash);
  });

  it("facade unchanged, imported module changes: importer name busts (facade-only hash would not)", () => {
    const bridge = `import { save } from "./courseSave";\nexport const bridge = save;\n`;
    write("src/bridge.ts", bridge);
    write("src/courseSave.ts", "export const save = () => 1;\n");

    const facade = join(root, "src/bridge.ts");
    const chunk = {
      type: "chunk" as const,
      name: "src/bridge",
      facadeModuleId: facade,
      isEntry: true,
      isDynamicEntry: false,
      exports: [] as string[],
      moduleIds: [facade, join(root, "src/courseSave.ts")],
    };

    const before = clientChunkFileNames().entryFileNames(chunk);
    const beforeSuffix = hashSuffix(before);

    // Pre-fix: hashing only the facade source stays put when a dep changes.
    const facadeOnlyHash = createRollupLikeHash(bridge);
    expect(readFileSync(facade, "utf8")).toBe(bridge);
    expect(beforeSuffix).not.toBe(facadeOnlyHash);

    write("src/courseSave.ts", "export const save = () => 2;\n");
    const after = clientChunkFileNames().entryFileNames({
      ...chunk,
      // Same facade source path; dep body changed on disk.
      moduleIds: chunk.moduleIds,
    });
    const afterSuffix = hashSuffix(after);

    expect(afterSuffix).not.toBe(beforeSuffix);
    expect(createRollupLikeHash(readFileSync(facade, "utf8"))).toBe(facadeOnlyHash);
    expect(afterSuffix).not.toBe(facadeOnlyHash);
  });

  it("renames a real shared chunk with no facade when one member changes", async () => {
    write("src/left.js", 'export { value } from "./shared.js";');
    write("src/right.js", 'export { value } from "./shared.js";');
    async function build(value: number) {
      write("src/shared.js", `export const value = ${value};`);
      const bundle = await rollup({ input: [join(root, "src/left.js"), join(root, "src/right.js")] });
      try {
        const naming = userOptions().build;
        const { output } = await bundle.generate({
          format: "es",
          entryFileNames: (chunk) => naming.entryFile(chunk, false),
          chunkFileNames: (chunk) => naming.chunkFile(chunk, false),
          manualChunks: { shared: [join(root, "src/shared.js")] },
        });
        const shared = output.find((chunk) => chunk.type === "chunk" && !chunk.isEntry);
        if (!shared || shared.type !== "chunk") throw new Error("missing shared chunk");
        expect(shared.facadeModuleId).toBeNull();
        expect(existsSync(join(root, shared.name))).toBe(false);
        return shared;
      } finally {
        await bundle.close();
      }
    }
    const before = await build(1);
    const after = await build(2);
    expect(after.code).not.toBe(before.code);
    expect(after.fileName).not.toBe(before.fileName);
  });

  it.each([false, true])("dependency edits change emitted bytes AND filenames (preserveModules=%s)", async (preserveModules) => {
    const facade = join(root, "src/Counter.client.js");
    const helper = join(root, "src/helper/index.js");
    write("src/Counter.client.js", '"use client";\nimport { n } from "./helper"; export const Counter = () => n;\n');

    async function build(n: number) {
      write("src/helper/index.js", `export const n = ${n};\n`);
      const bundle = await rollup({
        input: facade,
        onwarn(warning, warn) {
          if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
        },
        plugins: [{
          name: "fixture-directory-resolution",
          resolveId(id) { if (id === "./helper") return helper; },
        }],
      });
      try {
        const naming = userOptions().build;
        const { output } = await bundle.generate({
          format: "es",
          preserveModules,
          entryFileNames: (chunk) => naming.entryFile(chunk, false),
          chunkFileNames: (chunk) => naming.chunkFile(chunk, false),
        });
        return output.filter((chunk) => chunk.type === "chunk");
      } finally {
        await bundle.close();
      }
    }

    const before = await build(1);
    const after = await build(2);
    const oldEntry = before.find((chunk) => chunk.isEntry)!;
    const newEntry = after.find((chunk) => chunk.isEntry)!;
    expect(oldEntry).toBeDefined();
    expect(newEntry.code).not.toBe(oldEntry.code);
    expect(newEntry.fileName).not.toBe(oldEntry.fileName);
    // Check every reused URL, including separate chunks, not just the entry.
    for (const chunk of after) {
      const previous = before.find((old) => old.fileName === chunk.fileName);
      if (previous) expect(chunk.code).toBe(previous.code);
    }
  });

  it.each(["server-first", "browser-first"])("client refs agree across RSC, SSR and static naming (%s)", (order) => {
    const source = '"use client";\nimport { n } from "./helper";\nexport const Widget = () => n;\n';
    write("src/components/Widget.client.tsx", source);
    write("src/components/helper.ts", "export const n = 1;\n");
    const facade = join(root, "src/components/Widget.client.tsx");
    const buildEnv: ConfigEnv = { command: "build", mode: "production" };
    const environments = [
      { name: "rsc", condition: "react-server" as const, ssr: true },
      { name: "ssr-client", condition: "react-client" as const, ssr: true },
      { name: "static-browser", condition: "react-client" as const, ssr: false },
    ];
    if (order === "browser-first") environments.reverse();

    function snapshot() {
      // Compute the flight reference BEFORE any output configuration/build.
      const ref = createDefaultModuleID(userOptions(), buildEnv, "production")("src/components/Widget.client.tsx", source, true);
      const names: string[] = [];
      for (const environment of environments) {
        const result = resolveUserConfig({
          forceResolve: true,
          condition: environment.condition,
          config: { build: { ssr: environment.ssr } },
          configEnv: { ...buildEnv, isSsrBuild: environment.ssr },
          userOptions: userOptions(),
          autoDiscoveredFiles: emptyDiscovery,
        });
        if (result.type !== "success") throw result.error;
        const outputs = result.userConfig.build.rollupOptions!.output!;
        const output = (Array.isArray(outputs) ? outputs[outputs.length - 1] : outputs) as {
          entryFileNames: (info: unknown) => string;
        };
        const name = output.entryFileNames({
          type: "chunk", name: "src/components/Widget.client",
          facadeModuleId: facade, isEntry: true, isDynamicEntry: false, exports: [],
          // Static bundles deps; SSR/RSC preserve the facade. Both must agree.
          moduleIds: environment.ssr ? [facade] : [facade, join(root, "src/components/helper.ts")],
        });
        expect(name, environment.name).toBe(ref.replace(/^\//, ""));
        names.push(name);
      }
      return names;
    }

    const before = snapshot();
    write("src/components/helper.ts", "export const n = 2;\n");
    const after = snapshot();
    for (let i = 0; i < before.length; i++) expect(after[i]).not.toBe(before[i]);
  });
});
