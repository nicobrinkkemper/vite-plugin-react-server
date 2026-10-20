import { describe, it, expect } from "vitest";
import {
  createCombinedGraphChunkHash,
  serializeCombinedGraphChunkBag,
} from "vite-plugin-react-server/config";

/**
 * Guards the environment-invariant chunk hash used for browser cache-busting
 * names (fpm9 option 2). Naming must track every module in the chunk, not a
 * facade path or the Rollup chunk name, and must agree across build envs.
 */
describe("createCombinedGraphChunkHash", () => {
  const courseSave = "export function saveCourse() { return 1; }";
  const catalog = "export const catalog = [];";
  const bindings = "export const bindings = {};";
  const bridge = "export { saveCourse } from './courseSave.js';";
  const bridgeDep = "export function saveCourse() { return 2; }";

  const sharedChunk = {
    moduleIds: ["courseSave.js", "catalog.js", "bindings.js"],
    moduleSources: {
      "courseSave.js": courseSave,
      "catalog.js": catalog,
      "bindings.js": bindings,
    },
    importedChunkNames: [] as string[],
    fingerprint: { vite: "7.0.0", mode: "production" },
  };

  it("hashes a shared chunk with no facade path from all module sources", () => {
    const hash = createCombinedGraphChunkHash(sharedChunk);
    expect(hash).toMatch(/^[0-9a-z]+$/);
    expect(hash.length).toBeGreaterThan(0);
  });

  it("changes when any listed module source changes (no-facade shared chunk)", () => {
    const base = createCombinedGraphChunkHash(sharedChunk);
    const touched = createCombinedGraphChunkHash({
      ...sharedChunk,
      moduleSources: {
        ...sharedChunk.moduleSources,
        "catalog.js": "export const catalog = ['changed'];",
      },
    });
    expect(touched).not.toBe(base);
  });

  it("changes when a dependency source changes while the facade source is unchanged", () => {
    const withFacade = {
      moduleIds: ["bridge.js", "courseSave.js"],
      moduleSources: {
        "bridge.js": bridge,
        "courseSave.js": courseSave,
      },
      importedChunkNames: ["vendor"],
      fingerprint: "vite@7",
    };
    const base = createCombinedGraphChunkHash(withFacade);
    const depChanged = createCombinedGraphChunkHash({
      ...withFacade,
      moduleSources: {
        "bridge.js": bridge,
        "courseSave.js": bridgeDep,
      },
    });
    expect(withFacade.moduleSources["bridge.js"]).toBe(bridge);
    expect(depChanged).not.toBe(base);
  });

  it("is identical for the same bag across mocked environment labels", () => {
    // Env labels are caller context only — they must not enter the bag.
    const client = createCombinedGraphChunkHash(sharedChunk);
    const ssr = createCombinedGraphChunkHash({ ...sharedChunk });
    const rsc = createCombinedGraphChunkHash({
      moduleIds: [...sharedChunk.moduleIds].reverse(),
      moduleSources: { ...sharedChunk.moduleSources },
      importedChunkNames: [...sharedChunk.importedChunkNames],
      fingerprint: { mode: "production", vite: "7.0.0" },
    });
    expect(client).toBe(ssr);
    expect(client).toBe(rsc);
  });

  it("is stable under module id and import name reordering", () => {
    const a = createCombinedGraphChunkHash({
      moduleIds: ["a.js", "b.js"],
      moduleSources: { "a.js": "a", "b.js": "b" },
      importedChunkNames: ["z", "y"],
    });
    const b = createCombinedGraphChunkHash({
      moduleIds: ["b.js", "a.js"],
      moduleSources: { "b.js": "b", "a.js": "a" },
      importedChunkNames: ["y", "z"],
    });
    expect(a).toBe(b);
  });

  it("changes when an imported chunk name changes", () => {
    const base = createCombinedGraphChunkHash({
      ...sharedChunk,
      importedChunkNames: ["vendor"],
    });
    const renamed = createCombinedGraphChunkHash({
      ...sharedChunk,
      importedChunkNames: ["vendor-2"],
    });
    expect(renamed).not.toBe(base);
  });

  it("changes when the toolchain fingerprint changes", () => {
    const base = createCombinedGraphChunkHash(sharedChunk);
    const next = createCombinedGraphChunkHash({
      ...sharedChunk,
      fingerprint: { vite: "7.1.0", mode: "production" },
    });
    expect(next).not.toBe(base);
  });

  it("serializeCombinedGraphChunkBag is deterministic for snapshotting", () => {
    expect(serializeCombinedGraphChunkBag(sharedChunk)).toBe(
      [
        "modules",
        "bindings.js",
        String(bindings.length),
        bindings,
        "catalog.js",
        String(catalog.length),
        catalog,
        "courseSave.js",
        String(courseSave.length),
        courseSave,
        "imports",
        "fingerprint",
        '{"mode":"production","vite":"7.0.0"}',
      ].join("\n"),
    );
  });
});
