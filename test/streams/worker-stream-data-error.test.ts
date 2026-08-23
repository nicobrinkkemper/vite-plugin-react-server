import { describe, it, expect } from "vitest";
import { getCondition } from "../../plugin/config/getCondition.js";
import { startWorkerStream, startHandleRscStream, post } from "./workerHarness.js";

// The producer sends failures on the DATA port so they are ordered ahead of
// the null end-signal ({ type: "ERROR" }, handlers.onDataError). The
// worker-stream consumer's data handler wrote every non-null message into a
// binary PassThrough — an ERROR envelope hit the byte branch and threw
// ERR_INVALID_ARG_TYPE from the message callback, replacing the original
// error with a serialization crash. The envelope must surface the REAL error.
const isReactServer = getCondition() === "react-server";

describe.skipIf(isReactServer)(
  "createRscWorkerStream data-port error envelope",
  () => {
    it("a data-port ERROR destroys the stream with the original error", async () => {
      const seen: Error[] = [];
      const { text, ports } = startWorkerStream({ onError: (e) => seen.push(e) });
      const { dataPort } = await ports;
      post(dataPort, Buffer.from('0:["partial"]\n'));
      post(dataPort, {
        type: "ERROR",
        id: "/stream-suite",
        error: { message: "loader exploded", name: "Error" },
      });
      await expect(text).rejects.toThrow("loader exploded");
      expect(seen.some((e) => e.message.includes("loader exploded"))).toBe(true);
    });

    it("a data-port ERROR after the null cannot un-complete the stream", async () => {
      const { text, ports } = startWorkerStream();
      const { dataPort } = await ports;
      post(dataPort, Buffer.from('0:["ok"]\n'));
      post(dataPort, null);
      post(dataPort, {
        type: "ERROR",
        id: "/stream-suite",
        error: { message: "too late", name: "Error" },
      });
      expect(await text).toContain('0:["ok"]');
    });
  }
);

describe.skipIf(isReactServer)(
  "raw-port consumers: data-port close before the null is loud, never a hang",
  () => {
    it("createRscWorkerStream errors when the data port closes early", async () => {
      const { text, ports } = startWorkerStream();
      const { dataPort } = await ports;
      post(dataPort, Buffer.from('0:["partial"]\n'));
      dataPort.close();
      await expect(text).rejects.toThrow("closed before end-of-stream");
    });

    it("createRscWorkerStream: close after the null stays a clean end", async () => {
      const { text, ports } = startWorkerStream();
      const { dataPort } = await ports;
      post(dataPort, Buffer.from('0:["ok"]\n'));
      post(dataPort, null);
      dataPort.close();
      expect(await text).toContain('0:["ok"]');
    });

    it("handleRscStream errors when the data port closes early", async () => {
      const { text, ports } = startHandleRscStream();
      const { dataPort } = await ports;
      post(dataPort, Buffer.from('0:["partial"]\n'));
      dataPort.close();
      await expect(text).rejects.toThrow("closed before end-of-stream");
    });

    it("handleRscStream: close after the null stays a clean end", async () => {
      const { text, ports } = startHandleRscStream();
      const { dataPort } = await ports;
      post(dataPort, Buffer.from('0:["ok"]\n'));
      post(dataPort, null);
      dataPort.close();
      expect(await text).toContain('0:["ok"]');
    });
  }
);
