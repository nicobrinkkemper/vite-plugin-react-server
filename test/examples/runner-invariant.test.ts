/**
 * The runner/condition invariant (docs/internals/runner-spec.md): a declared
 * runner either matches the process condition or errors at config-resolve
 * time. This suite runs under BOTH conditions (test-both), so each side
 * asserts the half of the invariant its ambient condition can observe.
 */
import { describe, it, expect } from "vitest";
import { validateRunner, RUNNER_NAMES } from "../../plugin/config/runner.js";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";

const conditionPresent = getCondition() === REACT_CONDITION.server;

describe("validateRunner", () => {
  it("returns undefined when no runner is declared (legacy inference)", () => {
    expect(validateRunner(undefined)).toBeUndefined();
    expect(validateRunner(null)).toBeUndefined();
  });

  it("rejects unknown runners, listing all three options", () => {
    for (const bad of ["worker", "MAIN", 3, {}]) {
      try {
        validateRunner(bad);
        expect.unreachable("should have thrown");
      } catch (e) {
        const msg = String(e);
        for (const name of RUNNER_NAMES) {
          expect(msg).toContain(`"${name}"`);
        }
      }
    }
  });

  if (conditionPresent) {
    it("accepts 'main' under the process condition", () => {
      expect(validateRunner("main")).toBe("main");
    });

    it("rejects 'isolated' and 'edge' under the process condition", () => {
      expect(() => validateRunner("isolated")).toThrow(
        /owns react-server resolution itself; remove the process flag/
      );
      expect(() => validateRunner("edge")).toThrow(
        /owns react-server resolution itself; remove the process flag/
      );
    });
  } else {
    it("rejects 'main' without the process condition", () => {
      expect(() => validateRunner("main")).toThrow(
        /needs NODE_OPTIONS='--conditions react-server'/
      );
    });

    it("accepts 'isolated' without the process condition", () => {
      expect(validateRunner("isolated")).toBe("isolated");
    });

    it("rejects 'edge' as not implemented yet", () => {
      expect(() => validateRunner("edge")).toThrow(/not implemented yet/);
    });
  }
});
