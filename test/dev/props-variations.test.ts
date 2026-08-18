import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, createLogger } from "vite";
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
  pageURL3,
  response: RSCStreamResponse,
  response2: RSCStreamResponse,
  response3: RSCStreamResponse;
const testDir = resolve(__dirname, "../fixtures/props-variations.test");

// Capture every error/warn log the plugin emits during this test's lifecycle.
// Used by the sub-route regression test to assert that a sub-route RSC request
// does not surface any error logs (the symptom of the original bug).
const recordedErrors: string[] = [];
const recordedWarns: string[] = [];

describe("RSC Server", () => {
  beforeAll(async () => {
    // Clean up and create test directory
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    await setupTestProjectPropsVariations(testDir);
    // Custom logger that tees every error/warn into recordedErrors/recordedWarns.
    const customLogger = createLogger("info", { allowClearScreen: false });
    const origError = customLogger.error.bind(customLogger);
    const origWarn = customLogger.warn.bind(customLogger);
    customLogger.error = (msg, opts) => {
      recordedErrors.push(typeof msg === "string" ? msg : String(msg));
      origError(msg, opts);
    };
    customLogger.warn = (msg, opts) => {
      recordedWarns.push(typeof msg === "string" ? msg : String(msg));
      origWarn(msg, opts);
    };
    // Start the server
    server = await createServer({
      mode: "test",
      root: testDir,
      customLogger,
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          projectRoot: testDir,
          Page: (id) =>
            id.includes('page3')
              ? join("src", "page3", "page.tsx")
              : id.includes('page2')
                ? join("src", "page2", "page.tsx")
                : join("src", "page", "page.tsx"),
          // Mixed per-route props shapes, like a fileRouter project:
          // "/" keeps its props loader in page.tsx (propsPath undefined),
          // "/page2" has no props at all, "/page3" uses a sibling props file.
          props: (id) =>
            id.includes('page3') ? join("src", "page3", "props.ts") : undefined,
          build: {
            pages: ["/", "/page2", "/page3"],
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
    pageURL3 = `http://localhost:${port}/page3/index.rsc`;
    response = await handleRSCStream(pageURL);
    response2 = await handleRSCStream(pageURL2);
    response3 = await handleRSCStream(pageURL3);
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
    // Headless: 1:"$Sreact.fragment", 2:[], 3:{"name":"Root"...}
    // Client: 1:[], 2:[], 3:{"name":"Html"...
    // Server: 1:{"name":"Page"...}, 0:D{...}, 0:["$",...]
    expect(response.result).toMatch(/1:(\[\]|\{.*"name".*\}|"\$Sreact\.fragment")/); // First chunk (empty array, component data, or React.Fragment)
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
    // Headless: 1:"$Sreact.fragment", 2:[], 3:{"name":"Root"...}
    // Client: 1:[], 2:[], 3:{"name":"Html"...
    // Server: 1:{"name":"Page"...}, 0:D{...}, 0:["$",...]
    expect(response2.result).toMatch(/1:(\[\]|\{.*"name".*\}|"\$Sreact\.fragment")/); // First chunk (empty array, component data, or React.Fragment)
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

  it("should handle props from a sibling props file", async () => {
    expect(response3.ok).toBe(true);
    expect(response3.statusCode).toBe(200);
    expect(response3.result).toContain("Page3 Page");
    expect(response3.result).toContain("sibling-props-loaded");
  });

  // The cached-Page re-render tests below re-request each route after its
  // Page component is already cached in the rsc worker. Props are resolved
  // on a separate path in that case, and the in-page pattern regressed there
  // once (#289): first dev render had props, every refresh lost them. A
  // single fetch per route cannot catch that class of bug.

  it("in-page props survive a cached-Page re-render (refresh)", async () => {
    expect(response.result).toContain("in-page-props-loaded");
    const refreshed = await handleRSCStream(pageURL);
    expect(refreshed.ok).toBe(true);
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.result).toContain("Home Page");
    expect(refreshed.result).toContain("in-page-props-loaded");
  });

  it("sibling-file props survive a cached-Page re-render (refresh)", async () => {
    const refreshed = await handleRSCStream(pageURL3);
    expect(refreshed.ok).toBe(true);
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.result).toContain("Page3 Page");
    expect(refreshed.result).toContain("sibling-props-loaded");
  });

  it("no-props route stays clean on a cached-Page re-render (refresh)", async () => {
    const refreshed = await handleRSCStream(pageURL2);
    expect(refreshed.ok).toBe(true);
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.result).toContain("Home Page for");
  });

  it("does not emit RSC render error logs for the sub-route request", () => {
    // Prior to the fixture fix, every run of this file logged
    //   [client] RSC render error for /page2: Invalid URL
    // because the page2 fixture called new URL() on undefined props.
    // Catch any regression of that pattern at the logger boundary.
    const rscRenderErrors = recordedErrors.filter((m) =>
      /RSC render error/.test(m)
    );
    expect(rscRenderErrors).toEqual([]);
  });
});
