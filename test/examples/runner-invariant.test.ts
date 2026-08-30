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

    it("rejects 'edge' under the process condition", () => {
      // Same invariant as isolated: the edge runner owns react-server
      // resolution (baked at build time) — a global flag poisons the graph.
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

    it("accepts 'edge' without the process condition", () => {
      expect(validateRunner("edge")).toBe("edge");
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

    it("rejects 'edge' under the process condition", () => {
      expect(withRunner("edge")).toThrow(
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

    it("accepts 'edge' without the process condition", () => {
      // C1 scope: the edge runner requires transport "webpack" (the SSG
      // freeze renders through the baked pair; the esm leg is a later slice).
      const plugins = vitePluginReactServer({
        ...testUserOptions,
        runner: "edge",
        transport: "webpack",
      } as Parameters<typeof vitePluginReactServer>[0]);
      expect(plugins).toBeInstanceOf(Array);
    });

    it("rejects 'edge' with the esm transport (later slice), naming the path", () => {
      expect(withRunner("edge")).toThrow(/requires transport:"webpack"/);
    });
  }
});
