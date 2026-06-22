/**
 * Unit coverage for createConfiguredWorker — the shared reducer that wraps a
 * createWorker() call and collapses its tagged {type} result to a
 * worker-or-undefined, logging error/skip/throw uniformly.
 *
 * The createHandlerOptions characterization test runs with workers DISABLED, so
 * this is the dedicated coverage that makes folding the four (server/client x
 * rsc/html) worker blocks onto one helper safe (see createHandlerOptions.shared.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { createWorkerMock } = vi.hoisted(() => ({ createWorkerMock: vi.fn() }));
vi.mock("../../plugin/worker/createWorker.js", () => ({
  createWorker: createWorkerMock,
}));

import { createConfiguredWorker } from "../../plugin/config/createHandlerOptions.shared.js";

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
}

// Representative createWorker args — the helper passes them through unchanged.
const ARGS = {
  currentCondition: "react-server",
  workerPath: "/some/worker.js",
  logger: fakeLogger(),
  workerData: { id: "route" },
} as any;

beforeEach(() => createWorkerMock.mockReset());

describe("createConfiguredWorker", () => {
  it("returns the worker on success and forwards args verbatim to createWorker", async () => {
    const worker = { kind: "rsc" };
    createWorkerMock.mockResolvedValue({ type: "success", worker });
    const logger = fakeLogger();

    const result = await createConfiguredWorker("RSC worker", ARGS, logger, true);

    expect(result).toBe(worker);
    expect(createWorkerMock).toHaveBeenCalledTimes(1);
    expect(createWorkerMock).toHaveBeenCalledWith(ARGS);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("created successfully")
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("returns undefined and warns (with the cause) on an error result", async () => {
    createWorkerMock.mockResolvedValue({ type: "error", error: new Error("boom") });
    const logger = fakeLogger();

    const result = await createConfiguredWorker("RSC worker", ARGS, logger);

    expect(result).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });

  it("returns undefined and warns (with the reason) on a skip result", async () => {
    createWorkerMock.mockResolvedValue({ type: "skip", reason: "no worker path" });
    const logger = fakeLogger();

    const result = await createConfiguredWorker("HTML worker", ARGS, logger);

    expect(result).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("no worker path")
    );
  });

  it("stays quiet on success when verbose is falsy", async () => {
    createWorkerMock.mockResolvedValue({ type: "success", worker: {} });
    const logger = fakeLogger();

    await createConfiguredWorker("RSC worker", ARGS, logger, false);

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
