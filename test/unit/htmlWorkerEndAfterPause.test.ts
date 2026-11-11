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
 *
 * No sleeps: every step waits on a message the worker sends anyway (HTML on
 * the data port; READY per received Flight chunk and METRICS once the render
 * is complete on the control port). The one timer only turns a message that
 * never arrives into a readable failure.
 *
 * PAUSE has no acknowledgement and the two ports are not ordered against
 * each other. The test therefore lets the worker answer two Flight chunks
 * sent after PAUSE before it sends the row that finishes the render, and it
 * asserts that the late HTML was really held: not there when RESUME is sent.
 * A PAUSE that landed too late fails that assertion instead of passing
 * without testing anything.
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
// A row nothing references: the worker answers READY and renders nothing.
const padRow = (n: number) => `${n}:"pad"\n`;

type Event = { kind: "html"; text: string } | { kind: "eof" };

/** A growing log with a promise for "an entry matching this has arrived". */
function createLog<T>(name: string) {
  const entries: T[] = [];
  let notify = () => {};
  return {
    entries,
    add(entry: T) {
      entries.push(entry);
      notify();
    },
    count: (match: (entry: T) => boolean) => entries.filter(match).length,
    until(what: string, match: (entry: T) => boolean, times = 1) {
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`${name}: ${what} never arrived`)),
          10_000
        );
        const check = () => {
          if (entries.filter(match).length < times) return;
          clearTimeout(timer);
          resolve();
        };
        notify = check;
        check();
      });
    },
  };
}

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
      const events = createLog<Event>("data port");
      const controlMessages = createLog<{ type: string }>("control port");
      data.port1.on("message", (chunk) =>
        events.add(
          chunk == null
            ? { kind: "eof" }
            : { kind: "html", text: Buffer.from(chunk).toString() }
        )
      );
      control.port1.on("message", (m) => controlMessages.add(m));

      const isReady = (m: { type: string }) => m.type === "READY";
      const hasText = (text: string) => (e: Event) =>
        e.kind === "html" && e.text.includes(text);
      // Send one Flight chunk and wait until the worker has taken it.
      const sendRow = async (row: string) => {
        const seen = controlMessages.count(isReady);
        data.port1.postMessage(Buffer.from(row));
        await controlMessages.until("READY", isReady, seen + 1);
      };

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

      // Shell first, until its HTML (with the fallback) has arrived.
      await sendRow(shellRows);
      await events.until("shell HTML", hasText("waiting"));

      // Pause, and let the worker's loop turn before the render finishes.
      control.port1.postMessage({ type: "PAUSE", id: "/paused" });
      await sendRow(padRow(8));
      await sendRow(padRow(9));

      // The boundary resolves while paused. METRICS marks the render
      // complete; two more answered chunks put the end of the render (and
      // anything the worker sent with it) behind us.
      await sendRow(lateRow);
      await controlMessages.until("METRICS", (m) => m.type === "METRICS");
      await sendRow(padRow(10));
      await sendRow(padRow(11));

      // The late HTML is held: this is what makes the ordering below a test
      // of the pause path.
      expect(events.count(hasText("LATE_CONTENT"))).toBe(0);

      control.port1.postMessage({ type: "RESUME", id: "/paused" });
      await events.until("late HTML", hasText("LATE_CONTENT"));
      await events.until("end-of-data marker", (e) => e.kind === "eof");
      await controlMessages.until("END", (m) => m.type === "END");

      const eofAt = events.entries.findIndex((e) => e.kind === "eof");
      const lateAt = events.entries.findIndex(hasText("LATE_CONTENT"));
      expect(eofAt).toBe(events.entries.length - 1);
      expect(lateAt).toBeLessThan(eofAt);
      expect(controlMessages.count((m) => m.type === "END")).toBe(1);

      data.port1.close();
      control.port1.close();
    } finally {
      await worker.terminate();
    }
  });
});
