import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import { vitePluginReactClient } from "vite-plugin-react-server/client";
import { testUserOptions } from "../test-config.js";
import { mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setupTodoTestProject } from "../setup.js";
import type { RSCStreamResponse } from "../rsc-stream.js";
import { handleRSCStream } from "../rsc-stream.js";

let server;
let port = 3009;
const pageURL = `http://localhost:${port}/index.rsc`;
let response: RSCStreamResponse;
const testDir = resolve(
  __dirname,
  "../fixtures/client-server-action-integration.test"
);

describe("Client Server Action Integration", () => {
  beforeAll(async () => {
    // Clean up and create test directory
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    await setupTodoTestProject(testDir);

    // Start the server
    server = await createServer({
      root: testDir,
      plugins: [
        vitePluginReactClient({
          ...testUserOptions,
          projectRoot: testDir,
          Page: "src/page/page.tsx",
          build: {
            pages: ["/todos"],
          },
        }),
      ],
      server: {
        port: port,
      },
      // Use a unique cache directory to prevent race conditions
      cacheDir: join(process.cwd(), "node_modules", `.vite-test-${port}`),
    });

    await server.listen();
    if (server.config?.server?.port) {
      port = server.config.server.port;
    }
    response = await handleRSCStream(pageURL);
  });

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
    expect(response.result).toContain(
      '"id":"/src/page/actions.server.ts#addTodo"'
    );
    expect(response.result).toContain(
      '"id":"/src/page/actions.server.ts#toggleTodo"'
    );
    expect(response.result).toContain(
      '"id":"/src/page/actions.server.ts#deleteTodo"'
    );
    expect(response.result).toContain(
      '"id":"/src/page/actions.server.ts#getTodos"'
    );
  });

  it("should execute server actions and return results", async () => {
    // The RSC stream should contain the initial todos
    expect(response.result).toContain('"initialTodos":[]');
  });

  it("should handle client component references correctly", async () => {
    // The RSC stream should contain client component references
    expect(response.result).toContain(
      '7:I["src/components/TodoList.client.tsx","TodoList"]'
    );
  });
});
