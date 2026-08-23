import { EventEmitter } from "node:events";
import * as streamApi from "vite-plugin-react-server/stream";

// Shared stand-in worker for adversarial stream tests: scripts the worker's
// side of the two-port protocol to force orderings the real worker only
// produces under load. The consumer cannot distinguish "queued but
// undelivered" from "posted late", so driving the far end late is a
// deterministic stand-in for cross-port delivery lag.

export const FRAME_A = Buffer.from('0:["ok"]\n');
export const FRAME_E = Buffer.from('1:E{"digest":"render failed"}\n');

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Ports = { dataPort: any; controlPort: any };

export class FakeWorker extends EventEmitter {
  resolvePorts!: (p: Ports) => void;
  ports = new Promise<Ports>((r) => (this.resolvePorts = r));
  postMessage(msg: any) {
    if (msg?.type === "INIT") {
      this.resolvePorts({ dataPort: msg.dataPort, controlPort: msg.controlPort });
    }
  }
}

export const post = (port: any, msg: any) => {
  try {
    port.postMessage(msg);
  } catch {
    // Channel may already be closed; the consumer must cope with that too.
  }
};

export async function readWebStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function readNodeStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}

export function startHandleRscStream(overrides?: { handlers?: any; logger?: any }) {
  const worker = new FakeWorker();
  const stream = (streamApi as any).handleRscStream({
    options: {
      id: "stream-suite",
      route: "/stream-suite",
      url: "/stream-suite",
      projectRoot: process.cwd(),
      moduleRootPath: process.cwd(),
      rscWorker: worker,
      verbose: false,
      ...(overrides?.logger ? { logger: overrides.logger } : {}),
    },
    handlers: overrides?.handlers ?? {},
  }) as ReadableStream<Uint8Array>;
  return { text: readWebStream(stream), ports: worker.ports, worker };
}

export function startWorkerStream(overrides?: { onError?: (e: Error) => void }) {
  const worker = new FakeWorker();
  const { stream } = (streamApi as any).createRscWorkerStream({
    worker,
    route: "/stream-suite",
    url: "/stream-suite",
    projectRoot: process.cwd(),
    moduleBasePath: "",
    moduleBaseURL: "",
    moduleRootPath: process.cwd(),
    serverPipeableStreamOptions: {},
    ...(overrides?.onError ? { onError: overrides.onError } : {}),
  });
  return { text: readNodeStream(stream), ports: worker.ports, worker };
}
