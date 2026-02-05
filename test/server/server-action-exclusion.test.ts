import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestServerActionJS } from "../setup.js";
import { doBuild } from "../server/doBuild.js";
import { testUserOptions } from "../test-config.js";
import { mkdir, rm, writeFile } from "fs/promises";
import { resolve } from "path";

const testDir = resolve(__dirname, "../fixtures/server-action-exclusion.test");

describe("Server Action Build Exclusion", () => {
  let serverBundles: { id: string; code: string }[] = [];
  let clientBundles: { id: string; code: string }[] = [];

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await setupTestServerActionJS(testDir);

    // Create a file that should be excluded (no "use server" or "use client")
    await writeFile(
      resolve(testDir, "src/page/excluded.ts"),
      `export function excluded() {
        return "This should not be in the server build";
      }`
    );

    // Run build
    try {
      await doBuild({
        ...testUserOptions,
        projectRoot: testDir,
        Page: "src/page/page.tsx",
        build: {
          pages: ["/"],
        },
        onEvent: (event) => {
          if (
            event.type === "build.writeBundle.server" ||
            event.type === "build.writeBundle.static-server"
          ) {
            // Get all JS files from the server bundle
            Object.entries(event.data.bundle).forEach(([id, chunk]) => {
              if (
                id.endsWith(".js") &&
                !id.endsWith(".map") &&
                "code" in chunk
              ) {
                serverBundles.push({ id, code: chunk.code });
              }
            });
          } else if (
            event.type === "build.writeBundle.client" ||
            event.type === "build.writeBundle.static-client"
          ) {
            // Get all JS files from the client bundle
            Object.entries(event.data.bundle).forEach(([id, chunk]) => {
              if (
                id.endsWith(".js") &&
                !id.endsWith(".map") &&
                "code" in chunk
              ) {
                clientBundles.push({ id, code: chunk.code });
              }
            });
          }
        },
      });
    } catch (error) {
      throw error;
    }
  }, 30000);

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should not include excluded files in server build", async () => {
    // Check that no server bundle contains the excluded function
    for (const bundle of serverBundles) {
      expect(bundle.code).not.toContain("excluded");
    }
  });

  it("should not include client-only files in server build", async () => {
    // Check that client-only files are not in the server bundles
    for (const bundle of serverBundles) {
      expect(bundle.code).not.toContain("use client");
    }
  });

  it("should only include server action files in server build", async () => {
    // Check that server bundles contain registerServerReference
    let hasServerAction = false;
    for (const bundle of serverBundles) {
      if (bundle.code.includes("registerServerReference")) {
        hasServerAction = true;
        break;
      }
    }
    expect(hasServerAction).toBe(true);
  });

  it("should properly separate client and server bundles", async () => {
    // Check that client bundles contain createServerReference instead of raw server actions
    for (const bundle of clientBundles) {
      // Client bundles should contain createServerReference for server actions
      if (bundle.id.includes("actions.server")) {
        expect(bundle.code).not.toContain("registerServerReference");
      }
    }

    // Check that server bundles don't contain client components
    for (const bundle of serverBundles) {
      expect(bundle.code).not.toContain("createRoot");
    }
  });
});
