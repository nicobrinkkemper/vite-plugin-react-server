import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import type { MessagePort } from "node:worker_threads";
import { createHtmlStream } from "../../plugin/stream/createHtmlStream.server.js";

/**
 * A Flight stream that errors fails the HTML render with that error. The
 * error is a control message: the data port carries Flight chunks and the
 * end-of-input marker, nothing else, because the worker writes whatever
 * arrives there into its Flight input.
 *
 * No sleeps: every step waits on a message or a stream event. The one timer
 * only turns an event that never arrives into a readable failure.
 */

const within = <T>(what: string, promise: Promise<T>) =>
  Promise.race([
    promise,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`${what} never arrived`)), 2_000)
    ),
  ]);

const setup = (route: string) => {
  const ports: MessagePort[] = [];
  const workerMessages: { type: string }[] = [];
  const errors: Error[] = [];
  const rsc = new PassThrough();
  const html = createHtmlStream({
    route,
    rscStream: rsc,
    htmlWorker: {
      postMessage: (msg: { type: string }, transfer?: MessagePort[]) => {
        workerMessages.push(msg);
        if (transfer) ports.push(...transfer);
      },
    },
    onError: (error: Error) => errors.push(error),
  } as never);
  const [dataPort, controlPort] = ports as [MessagePort, MessagePort];
  const data: unknown[] = [];
  dataPort.on("message", (chunk) => data.push(chunk));
  const control: { type: string; error?: { message: string } }[] = [];
  let onControl = () => {};
  controlPort.on("message", (message) => {
    control.push(message);
    onControl();
  });
  const controlError = () =>
    within(
      "ERROR on the control port",
      new Promise<void>((resolve) => {
        const check = () => {
          if (control.some((m) => m.type === "ERROR")) resolve();
        };
        onControl = check;
        check();
      })
    );
  const close = () => {
    dataPort.close();
    controlPort.close();
  };
  return { rsc, html, data, control, controlError, workerMessages, errors, close };
};

describe("createHtmlStream: the Flight stream errors", () => {
  it("fails the HTML stream with the Flight error and keeps it off the data port", async () => {
    const t = setup("/flight-error");
    const dest = new PassThrough();
    const destError = new Promise<Error>((resolve) => dest.on("error", resolve));
    t.html.pipe(dest);

    t.rsc.write("first");
    t.rsc.destroy(new Error("flight exploded"));

    const error = await within("the render error", destError);
    expect(error.message).toBe("flight exploded");
    expect(t.errors.map((e) => e.message)).toEqual(["flight exploded"]);
    expect(t.workerMessages.map((m) => m.type)).toEqual(["INIT", "CLEANUP"]);

    // The worker is told on the control port, after the chunk that came
    // before the error. Both ports have delivered by then: the data port
    // was posted to first.
    await t.controlError();
    expect(t.control.find((m) => m.type === "ERROR")?.error?.message).toBe(
      "flight exploded"
    );
    expect(t.data.map((chunk) => Buffer.from(chunk as Buffer).toString())).toEqual([
      "first",
    ]);

    t.close();
  });
});
