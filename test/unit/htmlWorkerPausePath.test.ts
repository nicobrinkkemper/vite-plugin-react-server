import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The html worker's pause path, driven directly: the message handler runs in
 * this thread, the ports are plain objects and the render is a stub whose
 * callbacks the test calls. Every step is a function call, so the order of
 * PAUSE, the late HTML, the end of the render and RESUME is exactly the order
 * written below.
 *
 * A real worker cannot give that order. PAUSE travels on the control port and
 * has no acknowledgement, and Node empties one port's queue before it looks
 * at the next port, so a worker that keeps getting Flight chunks reads PAUSE
 * only after it has rendered them. htmlWorkerEndAfterPause.test.ts runs the
 * real worker and asserts what holds in either order.
 */

type Handlers = {
  onData: (id: string, data: unknown) => void;
  onEnd: (id: string) => void;
};

const render = vi.hoisted(() => ({ handlers: undefined as Handlers | undefined }));

vi.mock("node:worker_threads", () => ({
  parentPort: null,
  workerData: { userOptions: {}, resolvedConfig: { logLevel: "silent" } },
}));

vi.mock("../../plugin/worker/html/handleHtmlRender.client.js", () => ({
  handleHtmlRender: (_options: unknown, handlers: Handlers) => {
    render.handlers = handlers;
  },
}));

import { messageHandler } from "../../plugin/worker/html/messageHandler.client.js";

type Port = {
  sent: unknown[];
  postMessage: (message: unknown) => void;
  onmessage: ((event: { data: unknown }) => void) | null;
};

const createPort = (): Port => {
  const sent: unknown[] = [];
  return { sent, postMessage: (message) => sent.push(message), onmessage: null };
};

const ID = "/paused";

/** INIT plus a first Flight chunk, which starts the (stubbed) render. */
async function startRender() {
  const data = createPort();
  const control = createPort();
  await messageHandler({
    type: "INIT",
    id: ID,
    dataPort: data,
    controlPort: control,
    options: { route: ID },
  } as never);
  data.onmessage?.({ data: Buffer.from("flight") });
  const handlers = render.handlers;
  if (!handlers) throw new Error("the render did not start");
  const tell = (type: "PAUSE" | "RESUME") =>
    control.onmessage?.({ data: { type, id: ID } });
  const ends = () =>
    control.sent.filter((m) => (m as { type: string }).type === "END").length;
  return { data, handlers, tell, ends };
}

describe("html worker: pause path", () => {
  beforeEach(() => {
    render.handlers = undefined;
  });

  it("holds HTML and the end-of-data marker while paused, and sends them in order on RESUME", async () => {
    const { data, handlers, tell, ends } = await startRender();

    handlers.onData(ID, "shell");
    expect(data.sent).toEqual(["shell"]);

    tell("PAUSE");
    handlers.onData(ID, "late");
    handlers.onEnd(ID);

    // END is not held: the main thread learns the render is over at once.
    expect(ends()).toBe(1);
    // The late HTML and the end-of-data marker are.
    expect(data.sent).toEqual(["shell"]);

    tell("RESUME");
    expect(data.sent).toEqual(["shell", "late", null]);
    expect(ends()).toBe(1);
  });

  it("sends the end-of-data marker at once when the render ends unpaused", async () => {
    const { data, handlers, ends } = await startRender();

    handlers.onData(ID, "shell");
    handlers.onEnd(ID);

    expect(data.sent).toEqual(["shell", null]);
    expect(ends()).toBe(1);
  });

  it("sends nothing more when PAUSE and RESUME arrive after the render has ended", async () => {
    const { data, handlers, tell, ends } = await startRender();

    handlers.onData(ID, "shell");
    handlers.onData(ID, "late");
    handlers.onEnd(ID);
    tell("PAUSE");
    tell("RESUME");

    expect(data.sent).toEqual(["shell", "late", null]);
    expect(ends()).toBe(1);
  });
});
