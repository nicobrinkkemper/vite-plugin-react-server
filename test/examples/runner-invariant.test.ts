/**
 * The runner/condition invariant (docs/internals/runner-spec.md): a declared
 * runner either matches the process condition or errors at config-resolve
 * time. This suite runs under BOTH conditions (test-both), so each side
 * asserts the half of the invariant its ambient condition can observe.
 */
import { describe, it, expect } from "vitest";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { validateRunner, RUNNER_NAMES } from "../../plugin/config/runner.js";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";
import { testUserOptions } from "../test-config.js";

const conditionPresent = getCondition() === REACT_CONDITION.server;

describe("validateRunner", () => {
  it("rejects a missing runner, listing all three options", () => {
    for (const missing of [undefined, null]) {
      try {
        validateRunner(missing);
        expect.unreachable("should have thrown");
      } catch (e) {
        const msg = String(e);
        expect(msg).toContain("'runner' option is required");
        for (const name of RUNNER_NAMES) {
          expect(msg).toContain(`"${name}"`);
        }
      }
    }
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

    it("rejects 'isolated' under the process condition", () => {
      expect(() => validateRunner("isolated")).toThrow(
        /owns react-server resolution itself; remove the process flag/
      );
    });

    it("rejects 'edge' as not implemented before the condition check", () => {
      // A declared 'edge' hears not-implemented first — never a flag
      // instruction toward a value that then rejects anyway.
      expect(() => validateRunner("edge")).toThrow(/not implemented yet/);
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

// The `.` package entry (resolved through the exports map into dist/) is what
// normal consumers call — it must enforce the invariant itself, not only the
// explicit /client and /server subpaths.
describe("root package entry enforces the invariant", () => {
  const withRunner = (runner: unknown) => () =>
    vitePluginReactServer({
      ...testUserOptions,
      runner,
    } as Parameters<typeof vitePluginReactServer>[0]);

  it("rejects unknown runners", () => {
    expect(withRunner("bogus")).toThrow(/Unknown runner/);
  });

  it("rejects a missing runner", () => {
    // testUserOptions declares runnerForCondition() — strip it so this case
    // actually exercises the missing-runner path.
    const { runner: _runner, ...withoutRunner } = testUserOptions;
    expect(() =>
      vitePluginReactServer(withoutRunner as typeof testUserOptions)
    ).toThrow(/'runner' option is required/);
  });

  if (conditionPresent) {
    it("accepts 'main' under the process condition", () => {
      expect(withRunner("main")()).toBeInstanceOf(Array);
    });

    it("rejects 'isolated' under the process condition", () => {
      expect(withRunner("isolated")).toThrow(
        /owns react-server resolution itself; remove the process flag/
      );
    });
  } else {
    it("rejects 'main' without the process condition", () => {
      expect(withRunner("main")).toThrow(
        /needs NODE_OPTIONS='--conditions react-server'/
      );
    });

    it("accepts 'isolated' without the process condition", () => {
      expect(withRunner("isolated")()).toBeInstanceOf(Array);
    });
  }
});
