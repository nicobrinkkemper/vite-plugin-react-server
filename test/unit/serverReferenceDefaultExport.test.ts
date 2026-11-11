import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAst } from "vite";
import { serverReferenceClientPlugin } from "../../plugin/transformer/serverReferenceClientPlugin.js";
import { testUserOptions } from "../test-config.js";

/**
 * A "use server" module may default-export its function. The module that
 * stands in for it in the client and SSR environments has to stay valid
 * JavaScript (`default` is a reserved word, so `export const default` is not)
 * and the proxy has to keep `#default` as its reference id.
 */
describe("server reference module for a default-exported server function", () => {
  let dir: string;
  let file: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "vprs-server-ref-default-"));
    file = join(dir, "save.server.ts");
    await writeFile(
      file,
      `"use server";
export default async function save(title: string) { return title; }
export async function other(title: string) { return title; }
`
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const load = async (environment: "client" | "ssr"): Promise<string> => {
    const plugin = serverReferenceClientPlugin(testUserOptions) as any;
    return plugin.load.handler.call(
      { environment: { name: environment } },
      `\0vprs-server-ref:${file}`
    );
  };

  const exportedNames = (code: string): string[] =>
    parseAst(code).body.flatMap((node: any) =>
      node.type === "ExportDefaultDeclaration"
        ? ["default"]
        : node.type === "ExportNamedDeclaration"
          ? node.declaration.declarations.map((d: any) => d.id.name)
          : []
    );

  it("emits a client proxy that parses and references <module>#default", async () => {
    const code = await load("client");
    expect(exportedNames(code).sort()).toEqual(["default", "other"]);

    const ids = Array.from(
      code.matchAll(/createServerReference\("([^"]+)#(\w+)"/g),
      (m) => ({ module: m[1], name: m[2] })
    );
    expect(ids.map((id) => id.name).sort()).toEqual(["default", "other"]);
    expect(new Set(ids.map((id) => id.module)).size).toBe(1);
  });

  it("emits an SSR stub that parses and keeps the default export", async () => {
    const code = await load("ssr");
    expect(exportedNames(code).sort()).toEqual(["default", "other"]);
    expect(code).not.toContain("createServerReference");
  });
});
