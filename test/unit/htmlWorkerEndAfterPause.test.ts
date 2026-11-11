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
 * marker (null on the data port) must come AFTER the late HTML, because the
 * main thread ends its response and drops its listeners on it.
 *
 * END on the control port says the render is over. No pause holds it.
 *
 * This runs the real worker, so it cannot choose whether the worker reads
 * PAUSE before it renders the late row. PAUSE has no acknowledgement, the
 * two ports are not ordered against each other, and Node empties one port's
 * queue before it looks at the next: a worker that finds the late row
 * already queued renders it first and reads PAUSE afterwards. Scheduling
 * decides which, so the late HTML is held in some runs and not in others.
 * The assertions below hold in both orders. The held path itself is pinned
 * step by step in htmlWorkerPausePath.test.ts.
 *
 * No sleeps: every step waits on a message the worker sends anyway (HTML on
 * the data port; READY per received Flight chunk and END on the control
 * port). The one timer only turns a message that never arrives into a
 * readable failure.
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
  it("sends the late HTML before the end-of-data marker", async () => {
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

      // The boundary resolves after PAUSE was sent. END reports the end of
      // the render whether or not the HTML is held.
      control.port1.postMessage({ type: "PAUSE", id: "/paused" });
      await sendRow(lateRow);
      await controlMessages.until("END", (m) => m.type === "END");

      control.port1.postMessage({ type: "RESUME", id: "/paused" });
      await events.until("late HTML", hasText("LATE_CONTENT"));
      await events.until("end-of-data marker", (e) => e.kind === "eof");

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
