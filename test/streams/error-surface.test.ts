import { describe, expect, it, vi } from "vitest";
import { getCondition } from "../../plugin/config/getCondition.js";
import {
  FRAME_A,
  post,
  startHandleRscStream,
  startWorkerStream,
  wait,
} from "./workerHarness.js";

// Where a render failure's loudness lives, per consumer. A failure must
// surface as an errored stream, a loader-signal handoff, or a logged error —
// never as a clean-looking success with nothing on the console.
//
// handleRscStream (dev-request consumer): the DATA port carries the
// authoritative error copy, ordered ahead of the null end-signal. The
// control-port copy can lose the cross-port race and find the response
// already committed, so it is log-only by design.
// createRscWorkerStream (worker-stream consumer): the control-port ERROR is
// the error authority and destroys the stream.

const isReactServer = getCondition() === "react-server";

describe.skipIf(isReactServer)("handleRscStream error surface", () => {
  it("data-port render error rejects the stream, even after delivered frames", async () => {
    const { text, ports } = startHandleRscStream();
    const { dataPort } = await ports;
    post(dataPort, FRAME_A);
    post(dataPort, { type: "ERROR", error: "render exploded" });
    await expect(text).rejects.toThrow(/render exploded/);
  });

  it("data-port loader signal hands off to onError and the stream ends clean", async () => {
    const onError = vi.fn();
    const { text, ports } = startHandleRscStream({ handlers: { onError } });
    const { dataPort } = await ports;
    // The worker serializes loader signals with their marker field spread
    // onto the envelope (serializeError → toError round trip).
    post(dataPort, {
      type: "ERROR",
      error: { name: "Error", message: "not found", $$vprsNotFound: true },
    });
    post(dataPort, null);
    await expect(text).resolves.toBe("");
    expect(onError).toHaveBeenCalledTimes(1);
    const [, err] = onError.mock.calls[0]!;
    expect((err as any).$$vprsNotFound).toBe(true);
  });

  it("control-port render error is logged loudly while the data stream completes", async () => {
    const error = vi.fn();
    const { text, ports } = startHandleRscStream({
      logger: { info: () => {}, warn: () => {}, error },
    });
    const { dataPort, controlPort } = await ports;
    post(dataPort, FRAME_A);
    post(controlPort, {
      type: "ERROR",
      error: { name: "Error", message: "worker render failed" },
    });
    await wait(50);
    post(dataPort, null);
    expect(await text).toContain('0:["ok"]');
    // The stream itself stays intact (the in-band copy owns the response);
    // the console is where this copy must be loud.
    expect(error).toHaveBeenCalled();
    expect(String(error.mock.calls[0]![0])).toMatch(/render error/i);
  });
});

describe("createRscWorkerStream error surface", () => {
  it("control-port error rejects the stream, even with frames delivered", async () => {
    const { text, ports } = startWorkerStream();
    const { dataPort, controlPort } = await ports;
    post(dataPort, FRAME_A);
    post(controlPort, {
      type: "ERROR",
      error: { name: "Error", message: "worker render failed" },
    });
    await expect(text).rejects.toThrow(/worker render failed/);
  });

  it("control-port error after the data null cannot un-complete the stream", async () => {
    const onError = vi.fn();
    const { text, ports } = startWorkerStream({ onError });
    const { dataPort, controlPort } = await ports;
    post(dataPort, FRAME_A);
    post(dataPort, null);
    expect(await text).toContain('0:["ok"]');
    post(controlPort, {
      type: "ERROR",
      error: { name: "Error", message: "late failure" },
    });
    await wait(50);
    // The completed stream stands; the late copy still reaches onError so
    // the failure is not swallowed.
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
