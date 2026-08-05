import { describe, it, expect } from "vitest";
import { deriveImplicitSsr } from "../../plugin/config/deriveImplicitSsr.js";

describe("deriveImplicitSsr", () => {
  it("boolean build.ssr wins verbatim", () => {
    expect(
      deriveImplicitSsr({ buildSsr: true, isSsrBuild: false, previous: false })
    ).toBe(true);
    expect(
      deriveImplicitSsr({ buildSsr: false, isSsrBuild: true, previous: true })
    ).toBe(false);
  });

  it("a string build.ssr is an SSR entry path: SSR regardless of content", () => {
    expect(
      deriveImplicitSsr({
        buildSsr: "src/entry-server.ts",
        isSsrBuild: false,
        previous: undefined,
      })
    ).toBe(true);
    // Even a string that reads like a false-y flag names an entry file.
    expect(
      deriveImplicitSsr({ buildSsr: "false", isSsrBuild: false, previous: undefined })
    ).toBe(true);
    expect(
      deriveImplicitSsr({ buildSsr: "true", isSsrBuild: false, previous: undefined })
    ).toBe(true);
  });

  it("an empty string is no entry: not SSR", () => {
    expect(
      deriveImplicitSsr({ buildSsr: "", isSsrBuild: true, previous: undefined })
    ).toBe(false);
  });

  it("absent build.ssr keeps a previously derived value", () => {
    expect(
      deriveImplicitSsr({ buildSsr: undefined, isSsrBuild: false, previous: true })
    ).toBe(true);
    expect(
      deriveImplicitSsr({ buildSsr: undefined, isSsrBuild: true, previous: false })
    ).toBe(false);
  });

  it("absent build.ssr with no previous value falls back to configEnv.isSsrBuild", () => {
    expect(
      deriveImplicitSsr({ buildSsr: undefined, isSsrBuild: true, previous: undefined })
    ).toBe(true);
    expect(
      deriveImplicitSsr({ buildSsr: undefined, isSsrBuild: undefined, previous: undefined })
    ).toBe(undefined);
  });
});
