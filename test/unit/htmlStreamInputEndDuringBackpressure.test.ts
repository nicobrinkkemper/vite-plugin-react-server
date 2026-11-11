import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import type { MessagePort } from "node:worker_threads";
import { createHtmlStream } from "../../plugin/stream/createHtmlStream.server.js";

/**
 * Flight input keeps arriving while the HTML output is backpressured: those
 * chunks wait in a queue until the output drains. When the Flight input ENDS
 * during that pause, the queued chunks still have to reach the worker, and
 * the end-of-input marker goes after them. Input ended is not the same as
 * everything delivered.
 *
 * No sleeps: every step waits on a message or a stream event. The one timer
 * only turns a marker that never arrives into a readable failure.
 */

const nextMessage = (port: MessagePort) =>
  new Promise<unknown>((resolve) => port.once("message", resolve));

describe("createHtmlStream: Flight input that ends during HTML backpressure", () => {
  it("still delivers the Flight chunks queued during the pause", async () => {
    const ports: MessagePort[] = [];
    const worker = {
      postMessage: (_msg: unknown, transfer?: MessagePort[]) => {
        if (transfer) ports.push(...transfer);
      },
    };
    const rsc = new PassThrough();
    const html = createHtmlStream({
      route: "/queued",
      rscStream: rsc,
      htmlWorker: worker,
    } as never);
    const [dataPort, controlPort] = ports as [MessagePort, MessagePort];

    // What the worker's side of the data port receives, in order.
    const received: string[] = [];
    let onReceived = () => {};
    dataPort.on("message", (chunk) => {
      received.push(chunk === null ? "<end>" : Buffer.from(chunk).toString());
      onReceived();
    });
    const receivedIncludes = (item: string) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`"${item}" never arrived; worker received: ${received.join(",")}`)),
          2_000
        );
        const check = () => {
          if (!received.includes(item)) return;
          clearTimeout(timer);
          resolve();
        };
        onReceived = check;
        check();
      });

    rsc.write("first");
    await receivedIncludes("first");

    // The worker renders more HTML than the output buffer holds: PAUSE.
    const paused = nextMessage(controlPort);
    dataPort.postMessage(Buffer.alloc(128 * 1024, "a"));
    expect(await paused).toMatchObject({ type: "PAUSE" });

    // The last Flight chunk arrives while paused, then the input ends.
    rsc.end("last");
    await new Promise<void>((r) => rsc.once("end", () => r()));
    expect(received).toEqual(["first"]); // held, not sent, not ended

    // The consumer reads the HTML, the output drains and the queue flushes.
    const dest = new PassThrough();
    dest.resume();
    html.pipe(dest);
    await receivedIncludes("<end>");

    // Every queued chunk, then the end-of-input marker, once and last.
    expect(received).toEqual(["first", "last", "<end>"]);

    dataPort.close();
    controlPort.close();
  });
});
