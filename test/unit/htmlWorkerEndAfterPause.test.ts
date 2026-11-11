import { describe, it, expect } from "vitest";
import { MessageChannel, type MessagePort } from "node:worker_threads";
// Spawns the REAL html worker, so it runs against the built worker (its
// `--import register-vendor.js` only resolves from dist); test:server builds
// first.
import { createWorker } from "../../dist/plugin/worker/createWorker.js";

/**
 * The html worker holds HTML back while the main thread is paused and sends
 * it on RESUME. The end of the render can land in that window: the final
 * Suspense boundary resolves while the main thread is paused. The end-of-data
 * marker (null on the data port) must come AFTER the held HTML, because the
 * main thread ends its response and drops its listeners on it.
 */

const silentLogger = { info() {}, warn() {}, error() {} } as never;

// Hand-written Flight rows (no client references, so no module resolution):
// a ~128KB shell with a Suspense boundary whose content (row 2) is sent later.
const SHELL = "s".repeat(128 * 1024);
const shellRows =
  `1:"$Sreact.suspense"\n` +
  `0:["$","main",null,{"children":[["$","p","shell",{"children":"${SHELL}"}],` +
  `["$","$1","late",{"fallback":"waiting","children":"$L2"}]]}]\n`;
const lateRow = `2:["$","p",null,{"children":"LATE_CONTENT"}]\n`;

type Event = { kind: "html"; text: string } | { kind: "eof" };

describe("html worker: render ends while the main thread is paused", () => {
  it("sends the held HTML before the end-of-data marker", async () => {
    const created = await createWorker({
      reverseCondition: "react-client",
      mode: "development",
      logger: silentLogger,
      workerData: {
        userOptions: { projectRoot: process.cwd() },
        resolvedConfig: { logLevel: "silent" },
      },
    } as never);
    if (created.type !== "success") throw created.error ?? new Error(created.reason);
    const worker = created.worker;

    try {
      const data = new MessageChannel();
      const control = new MessageChannel();
      const events: Event[] = [];
      const ended = new Promise<void>((resolve) => {
        data.port1.on("message", (chunk) => {
          if (chunk == null) {
            events.push({ kind: "eof" });
            resolve();
          } else {
            events.push({ kind: "html", text: Buffer.from(chunk).toString() });
          }
        });
      });
      const controlMessages: Array<{ type: string }> = [];
      control.port1.on("message", (m) => controlMessages.push(m));

      worker.postMessage(
        {
          type: "INIT",
          id: "/paused",
          dataPort: data.port2,
          controlPort: control.port2,
          options: {
            route: "/paused",
            projectRoot: process.cwd(),
            moduleRootPath: process.cwd(),
            moduleBasePath: "",
            moduleBaseURL: "/",
          },
        },
        [data.port2, control.port2] as never
      );

      // Shell first, wait until its HTML (with the fallback) has arrived.
      data.port1.postMessage(Buffer.from(shellRows));
      const deadline = Date.now() + 10_000;
      while (!events.some((e) => e.kind === "html" && e.text.includes("waiting"))) {
        if (Date.now() > deadline) throw new Error("shell HTML never arrived");
        await new Promise((r) => setTimeout(r, 10));
      }

      // Pause, then let the boundary resolve while paused.
      control.port1.postMessage({ type: "PAUSE", id: "/paused" });
      await new Promise((r) => setTimeout(r, 50));
      data.port1.postMessage(Buffer.from(lateRow));
      await new Promise((r) => setTimeout(r, 200));

      control.port1.postMessage({ type: "RESUME", id: "/paused" });
      await Promise.race([
        ended,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("no end-of-data marker")), 5_000)
        ),
      ]);
      await new Promise((r) => setTimeout(r, 100));

      const eofAt = events.findIndex((e) => e.kind === "eof");
      const lateAt = events.findIndex(
        (e) => e.kind === "html" && e.text.includes("LATE_CONTENT")
      );
      expect(lateAt).toBeGreaterThan(-1);
      expect(eofAt).toBe(events.length - 1);
      expect(lateAt).toBeLessThan(eofAt);
      expect(controlMessages.filter((m) => m.type === "END")).toHaveLength(1);

      data.port1.close();
      control.port1.close();
    } finally {
      await worker.terminate();
    }
  });
});
