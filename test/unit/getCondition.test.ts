import { afterEach, beforeEach, describe, expect, it } from "vitest";
// Import the SOURCE (not the built package entry) so this test guards the
// tokenizer fix in `plugin/config/getCondition.ts` directly — reverting it
// must make the regression assertions below fail without a rebuild.
import { getNodeOptionsConditions } from "../../plugin/config/getCondition.js";

// getNodeOptionsConditions reads process.env.NODE_OPTIONS at call time and
// ignores execArgv, so it isolates the tokenizer from the conditions vitest
// itself runs under.
describe("getNodeOptionsConditions (NODE_OPTIONS tokenizer)", () => {
  const saved = process.env["NODE_OPTIONS"];

  beforeEach(() => {
    delete process.env["NODE_OPTIONS"];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env["NODE_OPTIONS"];
    else process.env["NODE_OPTIONS"] = saved;
  });

  it("returns [] when NODE_OPTIONS is unset or blank", () => {
    expect(getNodeOptionsConditions()).toEqual([]);
    process.env["NODE_OPTIONS"] = "   ";
    expect(getNodeOptionsConditions()).toEqual([]);
  });

  it("parses the space form: --conditions react-server", () => {
    process.env["NODE_OPTIONS"] = "--conditions react-server";
    expect(getNodeOptionsConditions()).toEqual(["react-server"]);
  });

  it("parses the equals form: --conditions=react-server", () => {
    process.env["NODE_OPTIONS"] = "--conditions=react-server";
    expect(getNodeOptionsConditions()).toEqual(["react-server"]);
  });

  it('parses the quoted equals form: --conditions="react-server" (regression, bug: quote split the flag from its value)', () => {
    process.env["NODE_OPTIONS"] = '--conditions="react-server"';
    expect(getNodeOptionsConditions()).toEqual(["react-server"]);
  });

  it("parses the single-quoted equals form: --conditions='react-server'", () => {
    process.env["NODE_OPTIONS"] = "--conditions='react-server'";
    expect(getNodeOptionsConditions()).toEqual(["react-server"]);
  });

  it("parses a quoted value after a space: --conditions \"react-server\"", () => {
    process.env["NODE_OPTIONS"] = '--conditions "react-server"';
    expect(getNodeOptionsConditions()).toEqual(["react-server"]);
  });

  it("splits comma lists, quoted or not", () => {
    process.env["NODE_OPTIONS"] = '--conditions="react-server, custom"';
    expect(getNodeOptionsConditions()).toEqual(["react-server", "custom"]);
  });

  it("keeps unrelated quoted flags separate from conditions", () => {
    process.env["NODE_OPTIONS"] =
      '--require "./my path/file.js" --conditions=react-server --no-addons';
    expect(getNodeOptionsConditions()).toEqual(["react-server"]);
  });

  it("parses the short flag: -C react-server", () => {
    process.env["NODE_OPTIONS"] = "-C react-server";
    expect(getNodeOptionsConditions()).toEqual(["react-server"]);
  });
});
