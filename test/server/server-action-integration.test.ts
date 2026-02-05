import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDevServer } from "../createDevServer.js";
import { vitePluginReactServer } from "../../dist/plugin/plugin.server.js";
import { testUserOptions } from "../test-config.js";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setupTestServerActionJS } from "../setup.js";
import { handleRSCStream, RSCStreamResponse } from "../rsc-stream.js";

let server,
  port = 3008;
let pageURL = `http://localhost:${port}/index.rsc`;
let response: RSCStreamResponse;
const testDir = resolve(
  __dirname,
  "../fixtures/server-action-integration.test"
);

describe("Server Action Integration", () => {
  beforeAll(async () => {
    // Clean up and create test directory
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    await setupTestServerActionJS(testDir);
    try {
      // Start the server
      server = await createDevServer({
        root: testDir,
        port,
        plugins: [
          vitePluginReactServer({
            ...testUserOptions,
            projectRoot: testDir,
            Page: "src/page/page.tsx",
            build: {
              pages: ["/"],
            },
          }),
        ],
      });
      if (server.config?.server?.port) {
        port = server.config.server.port;
      }
      response = await handleRSCStream(pageURL);
    } catch (error) {
      throw error;
    }
  }, 30000);

  afterAll(async () => {
    await server?.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("should have the right headers", async () => {
    expect(response.ok).toBe(true);
    expect(response.statusCode).toBe(200);
    const contentLength = response.responseHeaders.get("content-length");
    if (contentLength != null && !isNaN(Number(contentLength))) {
      expect(Number(contentLength)).toBeGreaterThan(0);
    }
    expect(response.responseHeaders).toBeInstanceOf(Headers);
    expect(
      response.responseHeaders.get("content-type")?.includes("text/x-component")
    ).toBe(true);
  });

  it("should include server action references in the RSC stream", async () => {
    expect(response.result).toContain('"id":"/src/page/actions.server.ts');
    expect(response.result).toContain(
      '"id":"/src/page/actions.server.ts'
    );
  });

  it("should execute server actions and return results", async () => {
    // The RSC stream should contain the results of the server actions
    expect(response.result).toContain('"Server-side Add: ",5');
    expect(response.result).toContain('"Server-side Subtract: ",3');
  });

  it("should handle server action errors gracefully", async () => {
    // Add a test for error handling by modifying the server action to throw
    const errorActionPath = resolve(testDir, "src/page/actions.server.ts");
    const errorActionContent = `"use server";

export function add(a, b) {
  const error = new Error('Test error');
  error.name = 'Error';
  error.digest = '';
  throw error;
}

export function subtract(a, b) {
  return a - b;
}`;

    // Write the modified server action file
    await writeFile(errorActionPath, errorActionContent);
    await server.moduleGraph.invalidateAll();
    const errorResponse = await handleRSCStream(pageURL);

    // The error should be caught and handled gracefully
    expect(errorResponse.ok).toBe(true);
    expect(errorResponse.result).toContain(
      '5:E{"digest":"","name":"Error","message":"Test error"'
    ); // Error marker in RSC format
    expect(errorResponse.result).toContain("Test error");
  });

  
  it("should handle server action errors defined at the function level", async () => {
    // Add a test for error handling by modifying the server action to throw
    const errorActionPath = resolve(testDir, "src/page/actions.server.ts");
    const errorActionContent = `
export function add(a, b) {
  "use server";
  const error = new Error('Test error');
  error.name = 'Error';
  error.digest = '';
  throw error;
}

export function subtract(a, b) {
  return a - b;
}`;

    // Write the modified server action file
    await writeFile(errorActionPath, errorActionContent);
    await server.moduleGraph.invalidateAll();
    const errorResponse = await handleRSCStream(pageURL);

    // The error should be caught and handled gracefully
    const response = await fetch(
      pageURL.replace("index.rsc", "actions.server.ts"),
      {
        method: "POST",
        body: JSON.stringify({
          id: "/src/page/actions.server.ts#add",
          args: [1, 2],
        }),
        headers: {
          Accept: "text/x-component",
        },
      }
    );
    const result = await response.text();
    console.log(result);
    expect(result).toContain(
      '"returnValue":{"success":false,"error":"Test error"}'
    );
  });
});
