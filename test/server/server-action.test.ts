import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestServerActionJS } from "../setup.js";
import { doBuild } from "./doBuild.js";
import { testUserOptions } from "../test-config.js";
import { mkdir, rm } from "fs/promises";
import { resolve } from "path";
import type { PluginEvent } from "vite-plugin-react-server/types";
import type { OutputBundle } from "rollup";
const testDir = resolve(__dirname, "../fixtures/server-action.test");
describe("Generic Server Action Build Output", () => {
  let events: PluginEvent[];
  let serverFiles: string[];
  let clientFiles: string[];
  let staticFiles: string[];
  let serverBundle: OutputBundle;
  let clientBundle: OutputBundle;
  let staticBundle: OutputBundle;
  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await setupTestServerActionJS(testDir);

    // Run build once
    try {
      events = await doBuild({
        ...testUserOptions,
        projectRoot: testDir,
        Page: "src/page/page.tsx",
        build: {
          pages: ["/"],
        },
      });

      // get the new server action files
      serverBundle = events.find((e) => e.type === "build.writeBundle.server")!.data.bundle;
      serverFiles = Object.keys(serverBundle).filter(
        (f) => !f.endsWith(".map")
      )
      clientBundle = events.find((e) => e.type === "build.writeBundle.client")!.data.bundle;

      clientFiles = Object.keys(clientBundle).filter(
        (f) => !f.endsWith(".map")
      )

      // get static bundle for index.html
      const staticEvent = events.find((e) => e.type === "build.writeBundle.static-client");
      if (staticEvent) {
        staticBundle = staticEvent.data.bundle;
        staticFiles = Object.keys(staticBundle).filter(
          (f) => !f.endsWith(".map")
        );
      } else {
        staticFiles = [];
      }

      // check if the new server action file is in the list
      expect(serverFiles.length).toBeGreaterThan(0);
      expect(serverFiles.includes("page/actions.server.js")).toBe(true);
      expect(serverFiles.includes("page/add.server.js")).toBe(true);
      expect(serverFiles.includes("page/subtract.server.js")).toBe(true);
      expect(clientFiles.length).toBeGreaterThan(0);
      expect(clientFiles.find((v) => v.includes("page/ClientComponent.client"))).toBeDefined();
      expect(staticFiles.includes("index.html")).toBe(true);
    } catch (error) {
      console.trace(error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
    }
  });

  it("should output at least one server action file", () => {
    expect(serverFiles.length).toBeGreaterThan(0);
  });

  it("should register the add server action using import from react-server-dom-esm/server.node", async () => {
    let found = false;
    for (const file of serverFiles) {
      const entry = serverBundle[file];
      if (entry.type === "asset") {
        continue;
      }
      const content = entry.code;
      if (!content || !content.includes('registerServerReference')) {
        continue;
      }
      expect(content).toContain("import { registerServerReference } from \"react-server-dom-esm/server.node\"");
      found = true;
    }
    expect(found).toBe(true);
  });
  it("should register the client component using import from react-server-dom-esm/server.node", async () => {
    let found = false;
    for (const file of serverFiles) {
      const entry = serverBundle[file];
      if (entry.type === "asset") {
        continue;
      }
      const content = entry.code;
      if (file.includes(".client.")) {
        expect(content).toContain('throw new Error("Attempted to call');
        expect(content).toContain("import { registerClientReference } from \"react-server-dom-esm/server.node\"");
      }
      if (file.includes(".server.")) {
        expect(content).toContain("import { registerServerReference } from \"react-server-dom-esm/server.node\"");
      }
      found = true;
    }
    expect(found).toBe(true);
  });
  it("should register the add server action, but not the subtract server action", async () => {
    const entry = serverBundle["page/add.server.js"];
    if (entry.type === "asset") {
      throw new Error("Add server action is an asset");
    }
    const addServerAction = entry.code;
    expect(addServerAction).toContain("registerServerReference(add, \"/page/add.server.js\", \"add\");");
    expect(addServerAction).not.toContain("registerServerReference(subtract");
  });
  it("should register the subtract server action, but not the add server action", async () => {
    const entry = serverBundle["page/subtract.server.js"];
    if (entry.type === "asset") {
      throw new Error("Subtract server action is an asset");
    }
    const subtractServerAction = entry.code;
    expect(subtractServerAction).toContain("registerServerReference(subtract, \"/page/subtract.server.js\", \"subtract\");");
    // wrench in the system, 2 use server directives but one non use server directive function export
    expect(subtractServerAction).toContain("registerServerReference(multiply, \"/page/subtract.server.js\", \"multiply\");");
    expect(subtractServerAction).not.toContain("registerServerReference(add");
  });
});
