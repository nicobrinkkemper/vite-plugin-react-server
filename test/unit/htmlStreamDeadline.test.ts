import { describe, it, expect } from "vitest";
import { PassThrough, Writable } from "node:stream";
import type { MessagePort } from "node:worker_threads";
import { createHtmlStream } from "../../plugin/stream/createHtmlStream.server.js";

/**
 * htmlTimeout is a deadline for the RENDER: the html worker must report the
 * end of its render (END on the control port) within it. The canonical
 * wedge: the RSC input is fully delivered and the worker then goes silent,
 * neither END nor ERROR. The deadline destroys the stream with a named
 * error. It does not cover delivery: once the render has ended, HTML still
 * held behind a paused output waits for its reader without a limit.
 *
 * The only fixed waits are the ones a timeout test needs: outlasting the
 * deadline to see that it did not fire.
 */

const stubWorker = () => {
  const ports: MessagePort[] = [];
  return {
    ports,
    worker: {
      postMessage: (_msg: unknown, transfer?: MessagePort[]) => {
        if (transfer) ports.push(...transfer);
      },
    } as never,
  };
};

describe("createHtmlStream htmlTimeout deadline", () => {
  it("fires on the canonical wedge: input fully delivered, worker silent", async () => {
    const { worker } = stubWorker();
    const rsc = new PassThrough();
    const html = createHtmlStream({
      route: "/wedge",
      rscStream: rsc,
      htmlWorker: worker,
      htmlTimeout: 150,
    } as never);
    const dest = new PassThrough();
    const destError = new Promise<Error>((resolve) => dest.on("error", resolve));
    html.pipe(dest);
    rsc.end(); // input done — the state the wedge hangs in

    const err = await Promise.race([
      destError,
      new Promise<never>((_res, reject) =>
        setTimeout(() => reject(new Error("deadline never fired")), 2_000)
      ),
    ]);
    expect(String(err)).toContain("did not complete within 150ms");
    expect(String(err)).toContain("neither finished rendering nor reported an error");
  });

  it("names the unread output when the render has not ended and nobody is reading", async () => {
    const stub = stubWorker();
    const html = createHtmlStream({
      route: "/slow",
      rscStream: new PassThrough(),
      htmlWorker: stub.worker,
      htmlTimeout: 150,
    } as never);
    // A consumer that takes one chunk and never asks for more.
    const dest = new Writable({ write() {} });
    const destError = new Promise<Error>((resolve) => dest.on("error", resolve));
    html.pipe(dest);

    // The worker sends more HTML than the stalled consumer takes. The first
    // chunk reaches the consumer; the rest stays in the output, which is
    // then backpressured for good: the last control message is a PAUSE.
    const [dataPort2, controlPort2] = stub.ports as [MessagePort, MessagePort];
    const control: string[] = [];
    controlPort2.on("message", (m: { type: string }) => control.push(m.type));
    const chunk = Buffer.alloc(2 * new PassThrough().writableHighWaterMark, "a");
    for (let i = 0; i < 4; i++) dataPort2.postMessage(chunk);

    const err = await Promise.race([
      destError,
      new Promise<never>((_res, reject) =>
        setTimeout(() => reject(new Error("deadline never fired")), 2_000)
      ),
    ]);
    expect(control.at(-1)).toBe("PAUSE");
    expect(String(err)).toContain("did not complete within 150ms");
    expect(String(err)).toContain("its output is not being read");
  });

  it("does not fire once the render has ended, while its HTML waits for a late reader", async () => {
    const stub = stubWorker();
    const html = createHtmlStream({
      route: "/late-reader",
      rscStream: new PassThrough(),
      htmlWorker: stub.worker,
      htmlTimeout: 150,
    } as never);

    // The worker's side: more HTML than the unread output takes, so it is
    // paused; the render ends meanwhile (END); the rest of the HTML and the
    // end-of-data marker go out on the RESUME that the reader triggers.
    const [dataPort2, controlPort2] = stub.ports as [MessagePort, MessagePort];
    const chunk = Buffer.alloc(2 * new PassThrough().writableHighWaterMark, "a");
    const control: string[] = [];
    controlPort2.on("message", (m: { type: string }) => {
      control.push(m.type);
      if (m.type === "RESUME" && readerAttached) {
        dataPort2.postMessage(Buffer.from("HELD_TAIL"));
        dataPort2.postMessage(null);
      }
    });
    let readerAttached = false;
    for (let i = 0; i < 4; i++) dataPort2.postMessage(chunk);
    controlPort2.postMessage({ type: "END", id: "/late-reader" });

    // Nobody reads until the deadline has passed.
    await new Promise((r) => setTimeout(r, 400));
    expect(control.at(-1)).toBe("PAUSE");

    const chunks: Buffer[] = [];
    const dest = new Writable({
      write(c: Buffer, _encoding, callback) {
        chunks.push(c);
        callback();
      },
    });
    readerAttached = true;
    await new Promise<void>((resolve, reject) => {
      dest.on("finish", resolve);
      dest.on("error", reject);
      html.pipe(dest);
    });

    const page = Buffer.concat(chunks).toString();
    expect(page.length).toBe(4 * chunk.length + "HELD_TAIL".length);
    expect(page.endsWith("HELD_TAIL")).toBe(true);
  });

  it("abort after the render ended still ends the stream", async () => {
    const stub = stubWorker();
    const html = createHtmlStream({
      route: "/abort-held",
      rscStream: new PassThrough(),
      htmlWorker: stub.worker,
      htmlTimeout: 150,
    } as never);
    const [dataPort2, controlPort2] = stub.ports as [MessagePort, MessagePort];
    const aborted = new Promise<void>((resolve) =>
      controlPort2.on("message", (m: { type: string }) => {
        if (m.type === "ABORT") resolve();
      })
    );
    const chunk = Buffer.alloc(2 * new PassThrough().writableHighWaterMark, "a");
    const held = new Promise<void>((resolve) =>
      controlPort2.once("message", () => resolve())
    );
    for (let i = 0; i < 4; i++) dataPort2.postMessage(chunk);
    controlPort2.postMessage({ type: "END", id: "/abort-held" });
    await held; // PAUSE: output held, nobody reading

    html.abort();
    await aborted;
    const dest = new PassThrough();
    dest.resume();
    await new Promise<void>((resolve, reject) => {
      dest.on("finish", resolve);
      dest.on("error", reject);
      html.pipe(dest);
    });
  });

  it("does not fire after the worker completes the render", async () => {
    const stub = stubWorker();
    const rsc = new PassThrough();
    const html = createHtmlStream({
      route: "/done",
      rscStream: rsc,
      htmlWorker: stub.worker,
      htmlTimeout: 150,
    } as never);
    const dest = new PassThrough();
    dest.resume();
    let destErr: Error | undefined;
    dest.on("error", (e) => (destErr = e));
    html.pipe(dest);

    // Simulate the worker: one HTML chunk, then the null end-signal on the
    // data port (the transferred worker-side end captured from postMessage).
    const dataPort2 = stub.ports[0]!;
    dataPort2.postMessage(Buffer.from("<html>ok</html>"));
    dataPort2.postMessage(null);
    rsc.end();

    await new Promise((r) => setTimeout(r, 400));
    expect(destErr).toBeUndefined();
  });
});
