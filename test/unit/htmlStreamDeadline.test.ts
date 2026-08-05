import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import { createHtmlStream } from "../../plugin/stream/createHtmlStream.server.js";

/**
 * The htmlTimeout whole-render deadline, exercised in its FIRING path. The
 * canonical wedge: the RSC input is fully delivered (isStreamEnded true) and
 * the html worker then goes silent — neither output nor ERROR. The deadline
 * must destroy the stream with its named error (guarding on OUTPUT completion,
 * not the input-ended flag), and must NOT fire once the worker's null
 * end-signal completed the render.
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
