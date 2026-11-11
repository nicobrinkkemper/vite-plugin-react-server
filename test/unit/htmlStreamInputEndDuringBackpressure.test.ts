import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import type { MessagePort } from "node:worker_threads";
import { createHtmlStream } from "../../plugin/stream/createHtmlStream.server.js";

/**
 * Flight input keeps arriving while the HTML output is backpressured: those
 * chunks wait in a queue until the output drains. When the Flight input ENDS
 * during that pause, the queued chunks still have to reach the worker. Input
 * ended is not the same as everything delivered.
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

    const received: string[] = [];
    dataPort.on("message", (chunk) => received.push(Buffer.from(chunk).toString()));

    rsc.write("first");
    await new Promise((r) => setTimeout(r, 20));
    expect(received).toEqual(["first"]);

    // The worker renders more HTML than the output buffer holds: PAUSE.
    const paused = nextMessage(controlPort);
    dataPort.postMessage(Buffer.alloc(128 * 1024, "a"));
    expect(await paused).toMatchObject({ type: "PAUSE" });

    // The last Flight chunk arrives while paused, then the input ends.
    rsc.end("last");
    await new Promise<void>((r) => rsc.once("end", () => r()));

    // The consumer reads the HTML, the output drains and the queue flushes.
    const resumed = nextMessage(controlPort);
    const dest = new PassThrough();
    dest.resume();
    html.pipe(dest);
    expect(await resumed).toMatchObject({ type: "RESUME" });
    await new Promise((r) => setTimeout(r, 20));

    expect(received.join(",")).toBe("first,last");

    dataPort.close();
    controlPort.close();
  });
});
