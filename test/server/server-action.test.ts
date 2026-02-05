import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestServerActionJS } from "../setup.js";
import { doBuild } from "./doBuild.js";
import { testUserOptions } from "../test-config.js";
import { readdir, readFile, mkdir, rm, writeFile } from "fs/promises";
import { resolve, join } from "path";
import { DEFAULT_CONFIG } from "../../plugin/config/defaults.js";
const testDir = resolve(__dirname, "../fixtures/server-action.test");
describe("Generic Server Action Build Output", () => {
  let events: any[];
  let serverFiles: string[];
  let clientFiles: string[];
  let distDir: string;
  let serverBundle: Record<string, any>;
  let clientBundle: Record<string, any>;
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
      serverBundle = events.find((e) => e.type === "build.writeBundle.server")?.data.bundle;
      serverFiles = Object.keys(serverBundle).filter(
        (f) => !f.endsWith(".map")
      )
      clientBundle = events.find((e) => e.type === "build.writeBundle.client")?.data.bundle;
      clientFiles = Object.keys(clientBundle).filter(
        (f) => !f.endsWith(".map")
      ) 
      // check if the new server action file is in the list
      expect(serverFiles.length).toBeGreaterThan(0);
      expect(serverFiles.includes("page/actions.server.js")).toBe(true);
      expect(serverFiles.includes("page/add.server.js")).toBe(true);
      expect(serverFiles.includes("page/subtract.server.js")).toBe(true);
      expect(clientFiles.length).toBeGreaterThan(0);
      expect(clientFiles.find((v) => v.includes("page/ClientComponent.client"))).toBeDefined();
      expect(clientFiles.includes("index.html")).toBe(true);
    } catch (error) {
      console.trace(error);
      throw error;
    }
  }, 30000);

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should output at least one server action file", () => {
    expect(serverFiles.length).toBeGreaterThan(0);
  });

  it("should register the add server action using import from react-server-dom-esm/server.node", async () => {
    let found = false;
    for (const file of serverFiles) {
      const content = serverBundle[file].code;
      if(!content || !content.includes('registerServerReference')) {
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
      const content = serverBundle[file].code;
      if(!content || !content.includes('registerClientReference')) {
        continue;
      }
      expect(content).toContain("import { registerClientReference } from \"react-server-dom-esm/server.node\"");
      found = true;
    } 
    expect(found).toBe(true);
  });
  it("should register the add server action, but not the subtract server action", async () => {
    const addServerAction = serverBundle["page/add.server.js"].code;
    expect(addServerAction).toContain("registerServerReference(add, \"/src/page/add.server.ts\", \"add\");");
    expect(addServerAction).not.toContain("registerServerReference(subtract");
  });
  it("should register the subtract server action, but not the add server action", async () => {
    const subtractServerAction = serverBundle["page/subtract.server.js"].code;
    expect(subtractServerAction).toContain("registerServerReference(subtract, \"/src/page/subtract.server.ts\", \"subtract\");");
    // wrench in the system, 2 use server directives but one non use server directive function export
    expect(subtractServerAction).toContain("registerServerReference(multiply, \"/src/page/subtract.server.ts\", \"multiply\");");
    expect(subtractServerAction).not.toContain("registerServerReference(add");
  });
});
