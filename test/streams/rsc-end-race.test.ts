import { describe, expect, it } from "vitest";
import * as streamApi from "vite-plugin-react-server/stream";
import { getCondition } from "../../plugin/config/getCondition.js";

// The two-port protocol's end-of-stream contract, exercised from the worker's
// side of the ports: the data port's `null` is the only ordered end authority;
// RSC_END on the control port is a fallback for a dead worker, never an eager
// end. These tests script a stand-in worker to force the orderings the real
// worker only produces under load. The consumer cannot distinguish "queued but
// undelivered" from "posted late", so driving the far end late is a
// deterministic stand-in for cross-port delivery lag.
//
// `handleRscStream` here is the default-condition (client) impl — under
// react-server the barrel resolves to the in-thread server impl, which has no
// ports. `createRscWorkerStream` is shared and runs under both conditions.

const isReactServer = getCondition() === "react-server";

const FRAME_A = Buffer.from('0:["ok"]\n');
const FRAME_E = Buffer.from('1:E{"digest":"render failed"}\n');

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Ports = { dataPort: any; controlPort: any };

function fakeWorker() {
  let resolvePorts!: (p: Ports) => void;
  const ports = new Promise<Ports>((r) => (resolvePorts = r));
  const worker = {
    postMessage(msg: any) {
      if (msg?.type === "INIT") {
        resolvePorts({ dataPort: msg.dataPort, controlPort: msg.controlPort });
      }
    },
  };
  return { worker, ports };
}

const post = (port: any, msg: any) => {
  try {
    port.postMessage(msg);
  } catch {
    // Channel may already be closed; the consumer must cope with that too.
  }
};

async function readWebStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function readNodeStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}

function startHandleRscStream() {
  const { worker, ports } = fakeWorker();
  const stream = (streamApi as any).handleRscStream({
    options: {
      id: "rsc-end-race",
      route: "/rsc-end-race",
      url: "/rsc-end-race",
      projectRoot: process.cwd(),
      moduleRootPath: process.cwd(),
      rscWorker: worker,
      verbose: false,
    },
    handlers: {},
  }) as ReadableStream<Uint8Array>;
  return { text: readWebStream(stream), ports };
}

function startWorkerStream() {
  const { worker, ports } = fakeWorker();
  const { stream } = (streamApi as any).createRscWorkerStream({
    worker,
    route: "/rsc-end-race",
    url: "/rsc-end-race",
    projectRoot: process.cwd(),
    moduleBasePath: "",
    moduleBaseURL: "",
    moduleRootPath: process.cwd(),
    serverPipeableStreamOptions: {},
  });
  return { text: readNodeStream(stream), ports };
}

function describeConsumer(
  name: string,
  skip: boolean,
  start: () => { text: Promise<string>; ports: Promise<Ports> }
) {
  describe.skipIf(skip)(name, () => {
    it("delivers everything when the data null precedes RSC_END", async () => {
      const { text, ports } = start();
      const { dataPort, controlPort } = await ports;
      post(dataPort, FRAME_A);
      post(dataPort, null);
      post(controlPort, { type: "RSC_END" });
      expect(await text).toContain('0:["ok"]');
    });

    // THE cross-port race: RSC_END is processed while frames are still
    // pending on the data port. The frame most likely to trail is the
    // in-band $E after a render failure — truncating it turns a should-be
    // error into a clean-looking success. Expected to fail until the
    // fallback timer stops ending a stream whose worker is still alive;
    // when it starts passing, delete the `.fails`.
    it.fails(
      "late data frames survive RSC_END (truncated by the fallback timer today)",
      async () => {
        const { text, ports } = start();
        const { dataPort, controlPort } = await ports;
        post(dataPort, FRAME_A);
        post(controlPort, { type: "RSC_END" });
        await wait(250);
        post(dataPort, FRAME_E);
        post(dataPort, null);
        expect(await text).toContain("1:E");
      }
    );

    it("still ends the stream when the worker never posts null (the case the fallback exists for)", async () => {
      const { text, ports } = start();
      const { dataPort, controlPort } = await ports;
      post(dataPort, FRAME_A);
      post(controlPort, { type: "RSC_END" });
      expect(await text).toContain('0:["ok"]');
    }, 5000);
  });
}

describeConsumer("handleRscStream (dev-request consumer)", isReactServer, startHandleRscStream);
describeConsumer("createRscWorkerStream (worker-stream consumer)", false, startWorkerStream);
