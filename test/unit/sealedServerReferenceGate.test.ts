import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createSealedServerReferenceGate } from "vite-plugin-react-server/references";

/**
 * The production sealing path (i0j): build a SEALED reference gate from Vite's
 * emitted server manifest, so a server-backed deploy resolves a client-supplied
 * action id by exact-key lookup instead of importing a path derived from the id.
 */

const serverRoot = resolve(__dirname, "../fixtures/sealed-gate.test/server");

describe("createSealedServerReferenceGate", () => {
  beforeAll(async () => {
    await rm(serverRoot, { recursive: true, force: true });
    await mkdir(serverRoot, { recursive: true });
    // A built server-action module: `addItem` is a real server reference,
    // `notAnAction` is a plain value that must never resolve as an action.
    await writeFile(
      join(serverRoot, "actions.mjs"),
      `const TAG = Symbol.for("react.server.reference");
export const addItem = Object.assign(async (title) => ({ ok: !!title }), { $$typeof: TAG });
export const notAnAction = 42;
`
    );
  });

  afterAll(async () => {
    await rm(serverRoot, { recursive: true, force: true });
  });

  const makeGate = () =>
    createSealedServerReferenceGate({
      serverRoot,
      base: "/",
      serverManifest: {
        "src/server/actions.server.ts": {
          file: "actions.mjs",
          src: "src/server/actions.server.ts",
        },
      },
    });

  it("seals on creation", () => {
    expect(makeGate().sealed).toBe(true);
  });

  it("resolves a manifest-registered action by its client-sent id", async () => {
    const gate = makeGate();
    const ref = await gate.resolveServerReference(
      "/src/server/actions.server.ts#addItem"
    );
    expect(await (ref as (t: string) => Promise<{ ok: boolean }>)("x")).toEqual({
      ok: true,
    });
  });

  it("rejects an export that is not a real server reference", async () => {
    const gate = makeGate();
    await expect(
      gate.resolveServerReference("/src/server/actions.server.ts#notAnAction")
    ).rejects.toThrow(/not a registered server reference/);
  });

  it("rejects a forged id whose module was never in the manifest (sealed)", async () => {
    const gate = makeGate();
    await expect(
      gate.resolveServerReference("/src/server/secrets.server.ts#steal")
    ).rejects.toThrow(/Unknown server reference/);
  });
});
