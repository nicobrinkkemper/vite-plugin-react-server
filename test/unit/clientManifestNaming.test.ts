import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ConfigEnv } from "vite";
import { rollup, type OutputChunk } from "rollup";
import { testUserOptions } from "../test-config.js";
import {
  resolveOptions,
  resolveUserConfig,
  createDefaultModuleID,
} from "vite-plugin-react-server/config";

/**
 * Browser files are named by Rollup's own [hash] of the emitted chunk, so one
 * name always holds the same bytes. The client build runs first and records
 * what it emitted in its manifest; the SSR and RSC builds name a client
 * reference's file, and bake its hosted id into the flight payload, from it.
 */
describe("client-manifest naming", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "vprs-manifest-naming-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function write(rel: string, body: string) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }

  function writeClientManifest(entries: Record<string, string>) {
    write(
      "dist/static/.vite/manifest.json",
      JSON.stringify(
        Object.fromEntries(
          Object.entries(entries).map(([src, file]) => [src, { file, src, isEntry: true }])
        )
      )
    );
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
    const result = resolveOptions({ ...testUserOptions, projectRoot: root }, true);
    if (result.type !== "success" || !result.userOptions) {
      throw new Error("resolveOptions failed");
    }
    return result.userOptions;
  }

  const buildEnv: ConfigEnv = { command: "build", mode: "production" };

  function fileNames(condition: "react-client" | "react-server", ssr: boolean) {
    const result = resolveUserConfig({
      forceResolve: true,
      condition,
      config: { build: { ssr } },
      configEnv: { ...buildEnv, isSsrBuild: ssr },
      userOptions: userOptions(),
      autoDiscoveredFiles: emptyDiscovery,
    });
    if (result.type !== "success") throw result.error;
    const output = result.userConfig.build.rollupOptions!.output!;
    return (Array.isArray(output) ? output[output.length - 1] : output) as {
      chunkFileNames: (info: unknown) => string;
      entryFileNames: (info: unknown) => string;
    };
  }

  const chunkInfo = (name: string, facadeModuleId: string | null, moduleIds: string[]) => ({
    type: "chunk" as const,
    name,
    facadeModuleId,
    isEntry: facadeModuleId != null,
    isDynamicEntry: false,
    exports: [] as string[],
    moduleIds,
  });

  async function generate(
    input: string[],
    options: { preserveModules?: boolean; manualChunks?: Record<string, string[]> } = {}
  ): Promise<OutputChunk[]> {
    const bundle = await rollup({
      input,
      onwarn(warning, warn) {
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
      },
    });
    try {
      const naming = userOptions().build;
      const { output } = await bundle.generate({
        format: "es",
        preserveModules: options.preserveModules,
        manualChunks: options.manualChunks,
        entryFileNames: (chunk) => naming.entryFile(chunk, false),
        chunkFileNames: (chunk) => naming.chunkFile(chunk, false),
      });
      return output.filter((chunk): chunk is OutputChunk => chunk.type === "chunk");
    } finally {
      await bundle.close();
    }
  }

  /** A name the second build reuses must hold the bytes it held in the first. */
  function expectSameNameSameBytes(before: OutputChunk[], after: OutputChunk[]) {
    for (const chunk of after) {
      const previous = before.find((old) => old.fileName === chunk.fileName);
      if (previous) expect(chunk.code, chunk.fileName).toBe(previous.code);
    }
  }

  it("browser entries and chunks are named by Rollup's [hash]", () => {
    write("src/split.ts", "export const split = 1;\n");
    const names = fileNames("react-client", false);
    // A name ending in props/page/server is a server convention, not a browser one.
    for (const name of ["courseSave", "create-split-props", "homepage", "observer"]) {
      expect(names.chunkFileNames(chunkInfo(name, null, [join(root, "src/split.ts")]))).toBe(
        `${name}-[hash].js`
      );
    }
    expect(
      names.entryFileNames(chunkInfo("src/bridge", join(root, "src/bridge.ts"), [join(root, "src/bridge.ts")]))
    ).toBe("bridge-[hash].js");
  });

  it.each([false, true])(
    "a dependency edit renames every file whose bytes changed (preserveModules=%s)",
    async (preserveModules) => {
      write("src/Counter.client.js", '"use client";\nimport { n } from "./helper/index.js"; export const Counter = () => n;\n');
      write("src/helper/index.js", "export const n = 1;\n");
      const before = await generate([join(root, "src/Counter.client.js")], { preserveModules });
      write("src/helper/index.js", "export const n = 2;\n");
      const after = await generate([join(root, "src/Counter.client.js")], { preserveModules });
      const oldEntry = before.find((chunk) => chunk.isEntry)!;
      const newEntry = after.find((chunk) => chunk.isEntry)!;
      expect(newEntry.code).not.toBe(oldEntry.code);
      expect(newEntry.fileName).not.toBe(oldEntry.fileName);
      expectSameNameSameBytes(before, after);
    }
  );

  it("a shared chunk with no facade is renamed when a member changes", async () => {
    write("src/left.js", 'export { value } from "./shared.js";');
    write("src/right.js", 'export { value } from "./shared.js";');
    const input = [join(root, "src/left.js"), join(root, "src/right.js")];
    const manualChunks = { shared: [join(root, "src/shared.js")] };
    write("src/shared.js", "export const value = 1;");
    const before = await generate(input, { manualChunks });
    write("src/shared.js", "export const value = 2;");
    const after = await generate(input, { manualChunks });
    const shared = (chunks: OutputChunk[]) => chunks.find((chunk) => !chunk.isEntry)!;
    expect(shared(before).facadeModuleId).toBeNull();
    expect(shared(after).fileName).not.toBe(shared(before).fileName);
    expectSameNameSameBytes(before, after);
  });

  it("a chunk whose sources did not change is renamed when what the app uses from it does", async () => {
    // A vendor chunk's bytes follow the exports the whole app imports: no
    // source of its own changes, so only a hash of the emitted chunk sees it.
    write("src/vendor.js", "export const a = 'a'; export const b = 'b'; export const c = 'c';\n");
    write("src/one.js", 'import { a } from "./vendor.js"; export const one = a;\n');
    const input = [join(root, "src/one.js"), join(root, "src/two.js")];
    const manualChunks = { vendor: [join(root, "src/vendor.js")] };
    write("src/two.js", 'import { b } from "./vendor.js"; export const two = b;\n');
    const before = await generate(input, { manualChunks });
    write("src/two.js", 'import { c } from "./vendor.js"; export const two = c;\n');
    const after = await generate(input, { manualChunks });
    const vendor = (chunks: OutputChunk[]) => chunks.find((chunk) => chunk.name === "vendor")!;
    expect(vendor(after).code).not.toBe(vendor(before).code);
    expect(vendor(after).fileName).not.toBe(vendor(before).fileName);
    expectSameNameSameBytes(before, after);
  });

  it("SSR, RSC and the flight reference all name the file the client build emitted", () => {
    const source = '"use client";\nexport const Widget = () => null;\n';
    write("src/components/Widget.client.tsx", source);
    writeClientManifest({ "src/components/Widget.client.tsx": "components/Widget.client-Bq2_x9Lm.js" });
    const facade = join(root, "src/components/Widget.client.tsx");
    const info = chunkInfo("src/components/Widget.client", facade, [facade]);

    expect(fileNames("react-client", true).entryFileNames(info)).toBe("components/Widget.client-Bq2_x9Lm.js");
    expect(fileNames("react-server", true).entryFileNames(info)).toBe("components/Widget.client-Bq2_x9Lm.js");
    const ref = createDefaultModuleID(userOptions(), buildEnv, "production")(
      "src/components/Widget.client.tsx",
      source,
      true
    );
    expect(ref).toBe("/components/Widget.client-Bq2_x9Lm.js");
  });

  it.each(["observer", "homepage", "props"])(
    "a directive client named %s still takes its browser filename in SSR",
    (name) => {
      const source = '"use client"; export const Widget = () => null;';
      const src = `src/components/${name}.tsx`;
      const file = `components/${name}-12345678.js`;
      write(src, source);
      writeClientManifest({ [src]: file });
      const facade = join(root, src);
      const info = chunkInfo(`src/components/${name}`, facade, [facade]);
      for (const condition of ["react-client", "react-server"] as const) {
        expect(fileNames(condition, true).entryFileNames(info)).toBe(file);
      }
      expect(createDefaultModuleID(userOptions(), buildEnv)(src, source, true)).toBe(`/${file}`);
    }
  );

  it("a server module that is not a client reference keeps its path", () => {
    write("src/page/page.tsx", "export const Page = () => null;\n");
    writeClientManifest({});
    const facade = join(root, "src/page/page.tsx");
    expect(
      fileNames("react-server", true).entryFileNames(chunkInfo("src/page/page", facade, [facade]))
    ).toBe("page/page.js");
  });

  it("an SSR build with no client manifest fails and says to build the client first", () => {
    write("src/components/Widget.client.tsx", '"use client";\nexport const Widget = () => null;\n');
    const facade = join(root, "src/components/Widget.client.tsx");
    expect(() =>
      fileNames("react-client", true).entryFileNames(chunkInfo("src/components/Widget.client", facade, [facade]))
    ).toThrow(/build the client environment before the ssr and server environments/);
  });
});
