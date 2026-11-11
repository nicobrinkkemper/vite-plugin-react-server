import { describe, it, expect } from "vitest";
import { createDrainQueue } from "../../plugin/stream/createDrainQueue.js";

/**
 * The ordering contract behind both backpressure queues of the HTML stream:
 * the terminal signal follows the last queued item, whatever order pause,
 * end and resume arrive in. Fully synchronous: the log is the proof.
 */
const setup = () => {
  const log: string[] = [];
  const queue = createDrainQueue<string>(
    (item) => log.push(item),
    () => log.push("<finish>")
  );
  return { log, queue };
};

describe("createDrainQueue", () => {
  it("sends items straight through while not paused", () => {
    const { log, queue } = setup();
    queue.push("a");
    queue.push("b");
    expect(log).toEqual(["a", "b"]);
  });

  it("finishes at once when the producer ends with nothing queued", () => {
    const { log, queue } = setup();
    queue.push("a");
    queue.end();
    expect(log).toEqual(["a", "<finish>"]);
  });

  it("holds items pushed during a pause and sends them in order on resume", () => {
    const { log, queue } = setup();
    queue.push("a");
    queue.pause();
    queue.push("b");
    queue.push("c");
    expect(log).toEqual(["a"]);
    queue.resume();
    expect(log).toEqual(["a", "b", "c"]);
  });

  it("holds the finish behind items queued during a pause", () => {
    const { log, queue } = setup();
    queue.pause();
    queue.push("a");
    queue.push("b");
    queue.end();
    expect(log).toEqual([]);
    queue.resume();
    expect(log).toEqual(["a", "b", "<finish>"]);
  });

  it("finishes during a pause when nothing is held", () => {
    const { log, queue } = setup();
    queue.pause();
    queue.end();
    expect(log).toEqual(["<finish>"]);
  });

  it("finishes exactly once", () => {
    const { log, queue } = setup();
    queue.pause();
    queue.push("a");
    queue.end();
    queue.end();
    queue.resume();
    queue.resume();
    queue.end();
    expect(log).toEqual(["a", "<finish>"]);
  });

  it("ignores items pushed after the producer ended: nothing follows the finish", () => {
    const { log, queue } = setup();
    queue.pause();
    queue.push("a");
    queue.end();
    queue.push("late");
    queue.resume();
    queue.push("later");
    expect(log).toEqual(["a", "<finish>"]);
  });
});
