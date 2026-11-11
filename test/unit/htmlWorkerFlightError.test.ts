import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import type { Worker } from "node:worker_threads";
import { createHtmlStream } from "../../plugin/stream/createHtmlStream.server.js";
// Spawns the REAL html worker, so it runs against the built worker (its
// `--import register-vendor.js` only resolves from dist); test:server builds
// first.
import { createWorker } from "../../dist/plugin/worker/createWorker.js";

/**
 * A Flight stream that errors fails the render with that error, and the html
 * worker stays usable. The worker writes everything on its data port into its
 * Flight input, so an error sent there throws inside the worker's message
 * handler and comes back as a Worker `error` event, the worker gone with it.
 *
 * No sleeps: every step waits on a stream event. The one timer only turns an
 * event that never arrives into a readable failure. "The worker survived" is
 * a second render on the same worker that completes: messages to a worker
 * are ordered, so it has handled the failed render's error by then.
 */

const silentLogger = { info() {}, warn() {}, error() {} } as never;

// Hand-written Flight rows (no client references, so no module resolution):
// a shell with a Suspense boundary whose content (row 2) never arrives.
const pendingRows =
  `1:"$Sreact.suspense"\n` +
  `0:["$","main",null,{"children":["$","$1","late",{"fallback":"waiting","children":"$L2"}]}]\n`;
const completeRow = `0:["$","p",null,{"children":"SECOND_RENDER"}]\n`;

const within = <T>(what: string, promise: Promise<T>) =>
  Promise.race([
    promise,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`${what} never arrived`)), 10_000)
    ),
  ]);

async function startWorker() {
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
  const worker: Worker = created.worker;
  const crashes: Error[] = [];
  worker.on("error", (error) => crashes.push(error));
  return { worker, crashes };
}

function render(worker: Worker, route: string) {
  const rsc = new PassThrough();
  const reported: Error[] = [];
  const html = createHtmlStream({
    route,
    rscStream: rsc,
    htmlWorker: worker,
    projectRoot: process.cwd(),
    moduleRootPath: process.cwd(),
    moduleBasePath: "",
    moduleBaseURL: "/",
    onError: (error: Error) => reported.push(error),
  } as never);
  const dest = new PassThrough();
  let text = "";
  let onText = () => {};
  dest.on("data", (chunk) => {
    text += chunk.toString();
    onText();
  });
  const failed = new Promise<Error>((resolve) => dest.on("error", resolve));
  const ended = new Promise<string>((resolve) => dest.on("end", () => resolve(text)));
  html.pipe(dest);
  const htmlIncludes = (part: string) =>
    new Promise<void>((resolve) => {
      const check = () => {
        if (text.includes(part)) resolve();
      };
      onText = check;
      check();
    });
  return { rsc, reported, failed, ended, htmlIncludes };
}

const secondRenderCompletes = async (worker: Worker) => {
  const second = render(worker, "/after-flight-error");
  second.rsc.end(completeRow);
  expect(await within("the second render", second.ended)).toContain("SECOND_RENDER");
};

describe("html worker: the Flight stream errors", () => {
  it("fails a render in progress with the Flight error and keeps the worker", async () => {
    const { worker, crashes } = await startWorker();
    try {
      const first = render(worker, "/flight-error");
      first.rsc.write(pendingRows);
      await within("the shell HTML", first.htmlIncludes("waiting"));

      first.rsc.destroy(new Error("flight exploded"));
      const error = await within("the render error", first.failed);
      expect(error.message).toBe("flight exploded");
      expect(first.reported.map((e) => e.message)).toEqual(["flight exploded"]);

      await secondRenderCompletes(worker);
      expect(crashes).toEqual([]);
    } finally {
      await worker.terminate();
    }
  });

  it("fails a render that has not received a Flight chunk yet", async () => {
    const { worker, crashes } = await startWorker();
    try {
      const first = render(worker, "/flight-error-early");
      first.rsc.destroy(new Error("flight exploded early"));
      const error = await within("the render error", first.failed);
      expect(error.message).toBe("flight exploded early");

      await secondRenderCompletes(worker);
      expect(crashes).toEqual([]);
    } finally {
      await worker.terminate();
    }
  });
});
