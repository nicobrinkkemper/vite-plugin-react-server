import { describe, expect, it } from "vitest";
import { getCondition } from "../../plugin/config/getCondition.js";
import {
  FRAME_A,
  FRAME_E,
  FakeWorker,
  post,
  startHandleRscStream,
  startWorkerStream,
  wait,
  type Ports,
} from "./workerHarness.js";

// The two-port protocol's end-of-stream contract, exercised from the worker's
// side of the ports: the data port's `null` (or in-band error) is the only
// ordered end authority, and the only other terminal condition is worker
// death — the worker's `exit` event errors a stream whose `null` never
// arrived. RSC_END is a control notification and never ends the data stream.
//
// `handleRscStream` here is the default-condition (client) impl — under
// react-server the barrel resolves to the in-thread server impl, which has no
// ports. `createRscWorkerStream` is shared and runs under both conditions.

const isReactServer = getCondition() === "react-server";

function describeConsumer(
  name: string,
  skip: boolean,
  start: () => { text: Promise<string>; ports: Promise<Ports>; worker: FakeWorker }
) {
  describe.skipIf(skip)(name, () => {
    it("delivers everything when the data null precedes RSC_END", async () => {
      const { text, ports, worker } = start();
      const { dataPort, controlPort } = await ports;
      post(dataPort, FRAME_A);
      post(dataPort, null);
      post(controlPort, { type: "RSC_END" });
      expect(await text).toContain('0:["ok"]');
      // A worker recycled after a completed stream must not disturb it.
      worker.emit("exit", 1);
    });

    // THE cross-port race: RSC_END is processed while frames are still
    // pending on the data port. The frame most likely to trail is the
    // in-band $E after a render failure — truncating it turns a should-be
    // error into a clean-looking success.
    it("late data frames survive RSC_END", async () => {
      const { text, ports } = start();
      const { dataPort, controlPort } = await ports;
      post(dataPort, FRAME_A);
      post(controlPort, { type: "RSC_END" });
      await wait(250);
      post(dataPort, FRAME_E);
      post(dataPort, null);
      expect(await text).toContain("1:E");
    });

    it("errors the stream when the worker dies before posting null", async () => {
      const { text, ports, worker } = start();
      const { dataPort, controlPort } = await ports;
      post(dataPort, FRAME_A);
      post(controlPort, { type: "RSC_END" });
      worker.emit("exit", 1);
      await expect(text).rejects.toThrow(/exit/i);
    }, 5000);
  });
}

describeConsumer("handleRscStream (dev-request consumer)", isReactServer, () => startHandleRscStream());
describeConsumer("createRscWorkerStream (worker-stream consumer)", false, () => startWorkerStream());
