import { describe, expect, it } from "vitest";
import {
  dependencyClientReferenceId,
  dependencyClientReferencePlugin,
} from "../../plugin/transformer/dependencyClientReferencePlugin.js";

type Handler = (this: unknown, ...args: unknown[]) => unknown;
const hook = (h: unknown) => (h as { handler: Handler }).handler;

const context = (name: string, resolvedId?: string) => ({
  environment: { name },
  resolve: async () => (resolvedId ? { id: resolvedId } : null),
});

const CLIENT_SOURCE = `"use client";\nexport function Link() {}\nexport default function Page() {}\n`;

describe("dependency client references (dev)", () => {
  it("references a dependency's client module through the bare specifier the server imported", async () => {
    const plugin = dependencyClientReferencePlugin();
    const server = context("server", "/app/node_modules/pkg/dist/client.js?v=1");
    await hook(plugin.resolveId).call(server, "pkg/client", "/app/src/page.tsx", {});

    expect(
      await dependencyClientReferenceId(server, "/app/node_modules/pkg/dist/client.js", CLIENT_SOURCE)
    ).toBe("/@id/__x00__vprs-dep-client:pkg/client?names=Link,default");
  });

  it("keeps the caller's id for first-party modules and unrecorded files", async () => {
    const plugin = dependencyClientReferencePlugin();
    const server = context("server", "/app/src/alias/Button.tsx");
    await hook(plugin.resolveId).call(server, "@/alias/Button", "/app/src/page.tsx", {});

    expect(
      await dependencyClientReferenceId(server, "/app/src/alias/Button.tsx", CLIENT_SOURCE)
    ).toBeUndefined();
    expect(
      await dependencyClientReferenceId(server, "/app/node_modules/other/index.js", CLIENT_SOURCE)
    ).toBeUndefined();
  });

  it("records nothing from browser resolution", async () => {
    const plugin = dependencyClientReferencePlugin();
    const client = context("client", "/app/node_modules/pkg/dist/client.js");
    expect(
      await hook(plugin.resolveId).call(client, "pkg/client", "/app/src/entry.tsx", {})
    ).toBeNull();
    expect(
      await dependencyClientReferenceId(client, "/app/node_modules/pkg/dist/client.js", CLIENT_SOURCE)
    ).toBeUndefined();
  });

  it("serves the browser a module that re-exports the names from the specifier", async () => {
    const plugin = dependencyClientReferencePlugin();
    const client = context("client");
    const id = "\0vprs-dep-client:@scope/pkg?names=Link,default";
    await expect(hook(plugin.resolveId).call(client, id, undefined, {})).resolves.toBe(id);
    expect(hook(plugin.load).call(client, id)).toBe(
      'export { Link, default } from "@scope/pkg";\n'
    );
  });
});
