import { describe, it, expect, vi } from "vitest";
import { Readable, PassThrough } from "node:stream";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleServerAction } from "../../dist/plugin/helpers/handleServerAction.server.js";

// When a server manifest is provided, handleServerAction must resolve through the
// SEALED gate (allowlist) and reject any id the build did not emit — without ever
// falling back to the open, path-derived import.
function mockReq(id: string, body = "[]") {
  const req = Readable.from([Buffer.from(body)]) as any;
  req.headers = { "x-rsc-action": id };
  req.url = "/__server-action";
  return req;
}
function mockRes() {
  const res = new PassThrough() as any;
  res.statusCode = 200;
  res.setHeader = () => {};
  return res as any;
}

const MANIFEST = {
  "src/server/actions.server.ts": {
    file: "assets/actions-abc.js",
    src: "src/server/actions.server.ts",
  },
};

describe("handleServerAction sealed path", () => {
  it("rejects a forged id not in the manifest, without falling back to import", async () => {
    const ssrLoadModule = vi.fn();
    const res = mockRes();
    await handleServerAction(mockReq("../../etc/evil.server.ts#pwn"), res, {
      projectRoot: "/proj",
      serverManifest: MANIFEST,
      serverRoot: "/proj/dist/server",
      base: "/",
      ssrLoadModule,
    });
    expect(res.statusCode).toBe(500);
    // The sealed path threw on the unknown id; it must never reach the open loader.
    expect(ssrLoadModule).not.toHaveBeenCalled();
  });

  it("auto-loads the manifest from serverRoot and seals — no serverManifest arg, no import fallback", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vprs-sa-"));
    await mkdir(join(dir, ".vite"), { recursive: true });
    await writeFile(join(dir, ".vite", "manifest.json"), JSON.stringify(MANIFEST));

    const ssrLoadModule = vi.fn();
    const res = mockRes();
    await handleServerAction(mockReq("../../etc/evil.server.ts#pwn"), res, {
      projectRoot: "/proj",
      serverRoot: dir, // no serverManifest passed — handler reads it from disk
      ssrLoadModule,
    });
    expect(res.statusCode).toBe(500); // forged id rejected by the auto-loaded sealed gate
    expect(ssrLoadModule).not.toHaveBeenCalled();
  });

  it("falls back to the open dev resolver when devOpen is set (no auto-seal)", async () => {
    const ssrLoadModule = vi.fn(async () => ({ addTodo: () => "ok" }));
    const res = mockRes();
    await handleServerAction(mockReq("src/server/actions.server.ts#addTodo"), res, {
      projectRoot: "/proj",
      devOpen: true,
      ssrLoadModule,
    });
    expect(ssrLoadModule).toHaveBeenCalledTimes(1);
  });
});
