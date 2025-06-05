import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server/server";
import { testUserOptions } from "../test-config.js";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setupTestProjectPropsVariations } from "../setup.js";
import { handleRSCStream, RSCStreamResponse } from "../rsc-stream.js";

let server,
  port = 3103,
  pageURL,
  pageURL2,
  response: RSCStreamResponse,
  response2: RSCStreamResponse;
const testDir = resolve(__dirname, "../fixtures/props-variations.test");

describe("RSC Server", () => {
  beforeAll(async () => {
    // Clean up and create test directory
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    await setupTestProjectPropsVariations(testDir);
    try {
      // Start the server
      server = await createServer({
        root: testDir,
        plugins: [
          vitePluginReactServer({
            ...testUserOptions,
            projectRoot: testDir,
            Page: (id) =>
              id === "/"
                ? join("src", "page", "page.tsx")
                : join("src", "page2", "page.tsx"),
            props: undefined, // no props
            build: {
              pages: ["/", "/page2"],
            },
          }),
        ],
        server: {
          port: port,
        },
      });

      await server.listen();
      if (server.config?.server?.port) {
        port = server.config.server.port;
      }
      pageURL = `http://localhost:${port}/index.rsc`;
      pageURL2 = `http://localhost:${port}/page2/index.rsc`;
      response = await handleRSCStream(pageURL);
      response2 = await handleRSCStream(pageURL2);
    } catch (error) {
      throw error;
    }
  });

  afterAll(async () => {
    await server?.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("Should have the right headers", async () => {
    expect(response.ok).toBe(true);
    expect(response.statusCode).toBe(200);
    const contentLength = response.responseHeaders.get("content-length");
    if (contentLength != null && !isNaN(Number(contentLength))) {
      console.log("contentLength", response.responseHeaders);
      expect(Number(contentLength)).toBeGreaterThan(0);
    }
    expect(response.responseHeaders).toBeInstanceOf(Headers);
    expect(
      response.responseHeaders.get("content-type")?.includes("text/x-component")
    ).toBe(true);
  });

  it("should handle props defined in the page file itself", async () => {
    // Verify the response contains RSC data
    // console.log("result", response);

    // Verify the response contains RSC data
    expect(response.result).toContain("0:");
    expect(response.result).toContain("1:");
    expect(response.result).toContain(
      "/* @__PURE__ */ __vite_ssr_import_0__.default.createElement"
    );
    expect(response.result).toContain(
      `{"children":["Public: ","http://localhost:${port}"]}`
    );
    expect(response.result).toContain(`{"children":["URL: ","/"]}`);
    expect(response.result).toContain(`["Dev: ",true]`);
    expect(response.result).toContain(
      `[["Page","${testDir}/src/page/page.tsx",`
    );
    expect(response.result).not.toContain(`$undefined`);
  });

  it("should handle no props at all", async () => {
    expect(response2.ok).toBe(true);
    expect(response2.statusCode).toBe(200);
    expect(response.result).toContain(
      `{"children":["Public: ","http://localhost:${port}"]}`
    );
    expect(response2.result).toContain(`{"children":["URL: ","/"]}`);
    expect(response2.result).toContain(`["Dev: ",true]`);
    expect(response2.result).toContain(
      `[["Page","${testDir}/src/page2/page.tsx",`
    );
    expect(response2.result).toContain(
      `{"children":["Home Page for ","/page2"]}`
    );
    expect(response2.result).not.toContain(`$undefined`);
  });
});
