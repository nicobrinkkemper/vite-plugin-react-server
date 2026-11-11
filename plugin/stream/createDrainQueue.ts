/**
 * An ordered queue in front of a consumer that can be paused, with one
 * terminal signal. `finish` is called exactly once, from the drain, and only
 * when the producer has ended AND every queued item has been sent: nothing
 * follows it. "Ended" (the producer is done) and "finished" (the terminal
 * signal went out) are separate states because items can still be queued
 * behind a pause when the producer ends.
 */
export function createDrainQueue<T>(
  send: (item: T) => void,
  finish: () => void
) {
  const queue: T[] = [];
  let paused = false;
  let state: "open" | "ended" | "finished" = "open";

  const drain = () => {
    while (!paused && queue.length > 0) {
      send(queue.shift() as T);
    }
    if (state === "ended" && queue.length === 0) {
      state = "finished";
      finish();
    }
  };

  return {
    /** Queue an item. Ignored once the producer has ended. */
    push(item: T) {
      if (state !== "open") return;
      queue.push(item);
      drain();
    },
    /** The producer is done; `finish` follows the last queued item. */
    end() {
      if (state === "open") state = "ended";
      drain();
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      drain();
    },
  };
}
