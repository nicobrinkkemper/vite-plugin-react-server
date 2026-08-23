import { MessageChannel } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import { MessagePortReadable } from "../../plugin/stream/MessagePortReadable.js";

// The port-close half of the end-of-stream contract: the data port's `null`
// (or an in-band error / worker exit) are the only legitimate stream endings.
// A port that CLOSES before `null` arrived is a truncation — the worker died
// or the channel tore down mid-stream — and must error the stream loudly.
// Ending cleanly here is how the SSG path writes a truncated `.rsc` to disk
// as a build success.

const FRAME_A = Buffer.from('0:["ok"]\n');

function collect(stream: MessagePortReadable) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}

describe("MessagePortReadable port-close semantics", () => {
  it("ends cleanly when null arrives, then the port closing is a no-op", async () => {
    const { port1, port2 } = new MessageChannel();
    const stream = new MessagePortReadable(port1 as never);
    const text = collect(stream);
    port2.postMessage(FRAME_A);
    port2.postMessage(null);
    expect(await text).toContain('0:["ok"]');
    port2.close();
  });

  it("errors — not clean-ends — when the port closes before null", async () => {
    const { port1, port2 } = new MessageChannel();
    const stream = new MessagePortReadable(port1 as never);
    const text = collect(stream);
    port2.postMessage(FRAME_A);
    port2.close();
    await expect(text).rejects.toThrow(/closed before/i);
  });
});
