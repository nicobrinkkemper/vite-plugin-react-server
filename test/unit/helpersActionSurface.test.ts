import { describe, it, expect } from "vitest";
import {
  handleServerAction as defaultConditionHandleServerAction,
  delegateServerActionToWorker,
} from "../../dist/plugin/helpers/handleServerAction.client.js";

// `handleServerAction` means one thing package-wide: the sealed executor,
// which exists only under react-server. The default-condition binding of the
// name must fail loudly with guidance — never silently resolve to the
// worker-delegating variant (different behavior, different signature).
describe("./helpers server-action surface (default condition)", () => {
  it("exports the worker delegator under its own name", () => {
    expect(typeof delegateServerActionToWorker).toBe("function");
  });

  it("handleServerAction throws setup guidance instead of impersonating the executor", async () => {
    const call = defaultConditionHandleServerAction();
    await expect(call).rejects.toThrow(/react-server/);
    await expect(call).rejects.toThrow(/delegateServerActionToWorker/);
  });
});
