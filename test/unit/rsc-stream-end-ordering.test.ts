import { describe, it, expect, vi } from "vitest";
import type { Worker } from "node:worker_threads";
import { handleRscStream } from "../../dist/plugin/stream/handleRscStream.client.js";
import { createRscWorkerStream } from "../../dist/plugin/stream/createRscWorkerStream.js";

/**
 * RSC_END arrives on the control port while data chunks may still be queued
 * on the data port — the two ports have no cross-port delivery-order
 * guarantee. Ending the stream directly from RSC_END truncated in-flight
 * chunks, most visibly the in-band `$E` error frame after a render failure:
 * the response became a committed 200 carrying only the leading
 * `:N<timeOrigin>` chunk, i.e. a silently swallowed error. This suite pins
 * the legal-but-unlucky interleaving deterministically: RSC_END is processed
 * BEFORE the remaining data chunks and the data port's `null` end-signal.
 * Only the `null` may end the stream eagerly; RSC_END is a fallback.
 *
 * Imports target the concrete dist modules (not the conditional package
 * entry) so both implementations are pinned regardless of the condition the
 * suite runs under.
 */

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

const chunkPreamble = () => new Uint8Array(Buffer.from(":N1784985134984.08\n"));
const chunkErrorFrame = () =>
  new Uint8Array(Buffer.from('1:E{"message":"intentional-render-failure"}\n'));

function createCapturingWorker() {
  const posted: any[] = [];
  const worker = {
    postMessage: vi.fn((msg: any) => {
      posted.push(msg);
    }),
    on: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as Worker;
  return { worker, posted };
}

async function readAll(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out += Buffer.from(value!).toString();
  }
}

describe("RSC_END vs data-port ordering (handleRscStream.client)", () => {
  it("keeps chunks that arrive after RSC_END was processed", async () => {
    const { worker, posted } = createCapturingWorker();

    const stream = handleRscStream({
      options: {
        worker,
        id: "req-1",
        route: "/",
        url: "/",
        projectRoot: "/",
        build: { pages: [], outDir: "dist", server: "server" },
        verbose: false,
      } as any,
      handlers: {} as any,
    });

    // The transferred ports from the INIT message are the worker's ends.
    const { dataPort, controlPort } = posted[0];
    const reader = stream.getReader();

    // First chunk flushes (this is what commits the HTTP 200 in dev).
    dataPort.postMessage(chunkPreamble());
    const first = await reader.read();
    expect(Buffer.from(first.value!).toString()).toContain(":N");

    // RSC_END lands and gets processed while the error frame + null are
    // still on their way over the data port.
    controlPort.postMessage({ type: "RSC_END", id: "req-1" });
    await tick();
    await tick();

    dataPort.postMessage(chunkErrorFrame());
    dataPort.postMessage(null);

    const rest = await readAll(reader);
    expect(rest).toContain("intentional-render-failure");
  });

  it("still ends the stream via RSC_END when the null end-signal never arrives", async () => {
    const { worker, posted } = createCapturingWorker();

    const stream = handleRscStream({
      options: {
        worker,
        id: "req-2",
        route: "/",
        url: "/",
        projectRoot: "/",
        build: { pages: [], outDir: "dist", server: "server" },
        verbose: false,
      } as any,
      handlers: {} as any,
    });

    const { dataPort, controlPort } = posted[0];
    const reader = stream.getReader();

    dataPort.postMessage(chunkPreamble());
    await reader.read();

    // Worker dies after RSC_END without ever posting the data-port null.
    controlPort.postMessage({ type: "RSC_END", id: "req-2" });

    const done = await Promise.race([
      reader.read().then((r) => r.done),
      new Promise<string>((r) => setTimeout(() => r("timeout"), 1000)),
    ]);
    expect(done).toBe(true);
  });
});

describe("RSC_END vs data-port ordering (createRscWorkerStream)", () => {
  it("keeps chunks that arrive after RSC_END was processed", async () => {
    const { worker, posted } = createCapturingWorker();

    const { stream } = createRscWorkerStream({
      worker,
      route: "/",
      url: "/",
      projectRoot: "/",
      moduleBasePath: "/",
      moduleBaseURL: "/",
      moduleRootPath: "/",
      serverPipeableStreamOptions: {},
    } as any);

    const { dataPort, controlPort } = posted[0];

    const received: Buffer[] = [];
    const ended = new Promise<void>((r) => stream.on("end", r));
    stream.on("data", (c: Buffer) => received.push(c));

    dataPort.postMessage(chunkPreamble());
    await tick();

    controlPort.postMessage({ type: "RSC_END", id: "/" });
    await tick();
    await tick();

    dataPort.postMessage(chunkErrorFrame());
    dataPort.postMessage(null);
    await ended;

    const body = Buffer.concat(received).toString();
    expect(body).toContain(":N");
    expect(body).toContain("intentional-render-failure");
  });
});
