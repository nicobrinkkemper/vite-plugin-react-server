// Thin boot shim — see bootWorker: posts BOOTING immediately and heartbeats
// while the heavy implementation graph loads, so the parent's startup
// inactivity watchdog only fires on genuine silence, not on a CPU-starved
// import evaluation. The implementation posts READY itself, as before.
import { bootWorker } from "../bootWorker.js";

await bootWorker("worker/rsc", () => import("./rsc-worker.production.impl.js"));
