/**
 * The data-port backpressure protocol, pinned end to end: DRAIN (pause) rides
 * the control port when the consumer's buffer fills, RESUME rides it back
 * when the consumer wants more, and a write parked during the pause is
 * FLUSHED — chunk and callback both. Two historical failure modes, both
 * silent: the paused _write dropped its chunk and never completed its
 * callback (wedging the producer forever), and the readable's "resume" was a
 * DRAIN sent on the data port, which nothing listens to. Together they
 * stalled every isolated-runner build whose flight stream outgrew the 16KB
 * buffer (the dev-variant suspended-render hang).
 */
import { describe, it, expect } from "vitest";
import { MessageChannel } from "node:worker_threads";
import { Writable, Readable, pipeline } from "node:stream";
import { createHash } from "node:crypto";
import { MessagePortWritable } from "../../dist/plugin/stream/MessagePortWritable.js";
import { MessagePortReadable } from "../../dist/plugin/stream/MessagePortReadable.js";

describe("MessagePort backpressure protocol", () => {
  it("delivers every byte through a slow consumer that engages DRAIN/RESUME", async () => {
    const dataChannel = new MessageChannel();
    const controlChannel = new MessageChannel();

    // Producer half (the worker's side of the ports).
    const writable = new MessagePortWritable(
      dataChannel.port2,
      controlChannel.port2
    );
    // Consumer half (the main thread's side).
    const readable = new MessagePortReadable(
      dataChannel.port1,
      controlChannel.port1
    );

    // Enough data to overrun the 16KB buffers many times over, with content
    // we can hash: dropped or reordered chunks fail loudly.
    const CHUNK = 1024;
    const COUNT = 256; // 256KB total
    const sent = createHash("sha256");
    // The producer must be PACED: an unpaced loop posts everything into the
    // port queue before the first DRAIN can round-trip, and the pause path
    // never runs. Yielding to the event loop between chunks is how a real
    // render behaves (flight flushes interleave with I/O).
    async function* chunks() {
      for (let i = 0; i < COUNT; i++) {
        const buf = Buffer.alloc(CHUNK, i % 251);
        sent.update(buf);
        yield buf;
        await new Promise((r) => setImmediate(r));
      }
    }

    // A deliberately slow sink so the readable's buffer fills and the pause
    // path actually runs — the regression lived exactly there.
    const received = createHash("sha256");
    let receivedBytes = 0;
    const slowSink = new Writable({
      highWaterMark: 1024,
      write(chunk: Buffer, _enc, cb) {
        received.update(chunk);
        receivedBytes += chunk.length;
        setTimeout(cb, 1);
      },
    });

    const producerDone = new Promise<void>((resolve, reject) =>
      pipeline(Readable.from(chunks()), writable, (err) =>
        err ? reject(err) : resolve()
      )
    );
    const consumerDone = new Promise<void>((resolve, reject) =>
      pipeline(readable, slowSink, (err) => (err ? reject(err) : resolve()))
    );

    // The old protocol never resumed a paused producer: this timeout is the
    // regression trip-wire.
    const guard = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("backpressure protocol stalled (no RESUME)")),
        15000
      ).unref()
    );

    await Promise.race([Promise.all([producerDone, consumerDone]), guard]);

    expect(receivedBytes).toBe(CHUNK * COUNT);
    expect(received.digest("hex")).toBe(sent.digest("hex"));

    dataChannel.port1.close();
    controlChannel.port1.close();
  }, 30000);
});
