import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as streamApi from "vite-plugin-react-server/stream";
import type { Worker } from "node:worker_threads";
import type { Logger } from "vite";
import type { StreamHandlers } from "vite-plugin-react-server/worker";

// `vite-plugin-react-server/stream` resolves to index.client (client handler +
// client-only helpers) under the default condition, and to index.server under
// react-server — where the client handler would eagerly pull in react-dom/server
// (unsupported in RSC). Gate on a client-only export (renderFlightToHtml, absent
// from index.server) so this runs only on the client leg of test-both, like the
// other client-only stream tests.
const handleRscStream = (streamApi as any)
  .handleRscStream as typeof import("../../plugin/stream/handleRscStream.client.js").handleRscStream;
const renderFlightToHtml = (streamApi as any).renderFlightToHtml;

// Regression guard for dev:ssr worker-error visibility.
//
// A worker RSC render throw crosses back to the main thread over the control
// port. The worker serializes the FULL error (message + stack) — the client
// stream handler must log the whole thing, matching what the main-thread runner
// (dev:rsc / `--conditions react-server`) already shows. It used to log only
// `err.message`, so a dev:ssr render failure surfaced without a stack and was
// effectively undiagnosable.

// Force dev-mode logging so logError emits the stack (production logging is
// message-only by design).
vi.mock("../../dist/plugin/config/getNodeEnv.js", () => ({
  getNodeEnv: vi.fn(() => "development"),
}));

describe.skipIf(!renderFlightToHtml)("handleRscStream (client) — worker error visibility", () => {
  let mockWorker: Worker;
  let mockLogger: Logger;
  let mockHandlers: StreamHandlers<"server">;

  beforeEach(() => {
    mockWorker = {
      postMessage: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
    } as unknown as Worker;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      warnOnce: vi.fn(),
      clearScreen: vi.fn(),
      hasWarned: false,
      hasErrorLogged: () => false,
    };

    mockHandlers = {
      onError: vi.fn(),
      onData: vi.fn(),
      onEnd: vi.fn(),
      onMetrics: vi.fn(),
      onHmrAccept: vi.fn(),
      onHmrUpdate: vi.fn(),
      onCssFile: vi.fn(),
      onShellError: vi.fn(),
      onRscRender: vi.fn(),
    } as unknown as StreamHandlers<"server">;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const options = {
    route: "/test",
    moduleBase: "src",
    moduleRootPath: "dist/client/",
    moduleBasePath: "/",
    moduleBaseURL: "/",
    projectRoot: "/",
    publicOrigin: "/",
    pageExportName: "Page",
    propsExportName: "props",
    rootExportName: "Root",
    htmlExportName: "Html",
    pagePath: "src/pages/test.tsx",
    propsPath: "src/pages/test.props.ts",
    serverPipeableStreamOptions: {},
    clientPipeableStreamOptions: {},
    verbose: false,
    panicThreshold: "none" as const,
    rscTimeout: 1000,
    htmlTimeout: 1000,
    fileWriteTimeout: 1000,
    workerShutdownTimeout: 1000,
    build: {
      pages: ["/test"],
      outDir: "dist",
      server: "dist/server",
      static: "dist/static",
      client: "dist/client",
      rscOutputPath: "index.rsc",
      htmlOutputPath: "index.html",
      assetsDir: "assets",
    },
    css: { inlineCss: false, inlineThreshold: 0, inlinePatterns: [], linkPatterns: [] },
    manifest: {},
    cssFiles: new Map(),
    globalCss: new Map(),
    url: "",
  };

  it("logs the full error (message + stack), not just the message", async () => {
    handleRscStream({
      options: { ...options, rscWorker: mockWorker, logger: mockLogger } as any,
      handlers: mockHandlers,
    });

    // The INIT message posted to the worker carries controlPort2 — the worker's
    // end of the control channel. Simulate the worker reporting a render throw.
    const init = (mockWorker.postMessage as unknown as { mock: { calls: any[][] } })
      .mock.calls[0][0];
    const controlPort2 = init.controlPort as { postMessage: (m: unknown) => void };
    controlPort2.postMessage({
      type: "ERROR",
      id: "/test",
      error: {
        name: "Error",
        message: "boom-message",
        stack: "Error: boom-message\n    at throwingComponent (src/page/page.tsx:2:9)",
      },
    });

    // Control-port delivery is async; let it land.
    await new Promise((r) => setTimeout(r, 40));

    const logged = (mockLogger.error as unknown as { mock: { calls: any[][] } })
      .mock.calls.map((c) => String(c[0]))
      .join("\n");
    expect(logged).toContain("boom-message");
    // The stack frame proves the whole error surfaced, not just the bare message.
    expect(logged).toMatch(/src\/page\/page\.tsx/);
  });
});
