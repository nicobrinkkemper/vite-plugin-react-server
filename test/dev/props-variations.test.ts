import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config.js";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setupTestProjectPropsVariations } from "../setup.js";
import type { RSCStreamResponse } from "../rsc-stream.js";
import { handleRSCStream } from "../rsc-stream.js";

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
    // Start the server
    server = await createServer({
      mode: "test",
      root: testDir,
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          projectRoot: testDir,
          Page: (id) =>
            !id.includes('page2')
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
      // Use a unique cache directory to prevent race conditions
      cacheDir: join(process.cwd(), "node_modules", `.vite-test-${port}`),
    });

    await server?.listen();
    if (server?.config?.server?.port) {
      port = server.config.server.port;
    }
    pageURL = `http://localhost:${port}/index.rsc`;
    pageURL2 = `http://localhost:${port}/page2/index.rsc`;
    response = await handleRSCStream(pageURL);
    response2 = await handleRSCStream(pageURL2);
  });

  afterAll(async () => {
    await server?.close();
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

    // Verify the response contains RSC streaming data
    expect(response.result).toContain(":N"); // RSC stream format starts with timestamp
    // Handle different RSC stream formats between client and server environments
    // Client: 1:[], 2:[], 3:{"name":"Html"...
    // Server: 1:{"name":"Page"...}, 0:D{...}, 0:["$",...]
    expect(response.result).toMatch(/1:(\[\]|\{.*"name".*\})/); // First chunk (empty array or component data)
    // Client has 2:[] and 3:{"name":"Html"...}, Server has 0:D{...} and 0:["$",...]
    expect(response.result).toMatch(/(2:(\[\]|\{.*"name".*\})|0:D\{.*\})/); // Second chunk or server data chunk
    expect(response.result).toMatch(/(3:(\[\]|\{.*"name".*\})|0:\[.*\])/); // Third chunk or server element chunk
    // Server environment only contains Page component directly, not Html/Root wrappers
    expect(response.result).toContain("Page"); // Should contain Page component
    expect(response.result).toContain("Mode:"); // Should contain environment variables
    expect(response.result).toContain("test"); // Should contain test mode
    expect(response.result).toContain("Home Page"); // Should contain page content
  });

  it("should handle no props at all", async () => {
    expect(response2.ok).toBe(true);
    expect(response2.statusCode).toBe(200);
    // Verify the response contains RSC streaming data
    expect(response2.result).toContain(":N"); // RSC stream format starts with timestamp
    // Handle different RSC stream formats between client and server environments
    // Client: 1:[], 2:[], 3:{"name":"Html"...
    // Server: 1:{"name":"Page"...}, 0:D{...}, 0:["$",...]
    expect(response2.result).toMatch(/1:(\[\]|\{.*"name".*\})/); // First chunk (empty array or component data)
    // Client has 2:[] and 3:{"name":"Html"...}, Server has 0:D{...} and 0:["$",...]
    expect(response2.result).toMatch(/(2:(\[\]|\{.*"name".*\})|0:D\{.*\})/); // Second chunk or server data chunk
    expect(response2.result).toMatch(/(3:(\[\]|\{.*"name".*\})|0:\[.*\])/); // Third chunk or server element chunk
    // Server environment only contains Page component directly, not Html/Root wrappers
    expect(response2.result).toContain("Page"); // Should contain Page component
    expect(response2.result).toContain("Mode:"); // Should contain environment variables
    expect(response2.result).toContain("test"); // Should contain test mode
    expect(response2.result).toContain("Home Page"); // Should contain page content
    // Verify the response contains the correct page path
    expect(response2.result).toContain("page2/page.tsx");
    // Verify the response contains page content
    expect(response2.result).toContain("Home Page for");
    // Server environment shows undefined values as $undefined in RSC stream, which is expected
  });
});
