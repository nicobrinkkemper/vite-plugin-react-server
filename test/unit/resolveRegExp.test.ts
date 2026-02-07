import {
  resolveDirectiveMatcher,
  resolvePatternWithValues,
  resolveRegExp,
  parsePattern,
} from "vite-plugin-react-server/config";
import type { DeserializedRegExp } from "vite-plugin-react-server/types";

import { describe, it, expect } from "vitest";

describe("resolveDirectiveMatcher", () => {
  describe("string patterns", () => {
    it("matches simple file extensions", () => {
      const matcher = resolveDirectiveMatcher("*.js");
      expect(matcher("file.js")).toBe(true);
      expect(matcher("file.ts")).toBe(false);
    });

    it("matches multiple extensions", () => {
      const matcher = resolveDirectiveMatcher("*.{js,ts}");
      expect(matcher("file.js")).toBe(true);
      expect(matcher("file.ts")).toBe(true);
      expect(matcher("file.css")).toBe(false);
    });

    it("matches directory patterns", () => {
      const matcher = resolveDirectiveMatcher("src/*.js");
      expect(matcher("src/file.js")).toBe(true);
      expect(matcher("file.js")).toBe(false);
    });

    it("handles case sensitivity", () => {
      const matcher = resolveDirectiveMatcher("*.js");
      expect(matcher("file.JS")).toBe(false);

      const caseInsensitive = resolveDirectiveMatcher("*.js/i");
      expect(caseInsensitive("file.JS")).toBe(true);
    });
  });

  describe("RegExp patterns", () => {
    it("uses RegExp objects as-is", () => {
      const matcher = resolveDirectiveMatcher(/\.js$/);
      expect(matcher("file.js")).toBe(true);
      expect(matcher("file.ts")).toBe(false);
    });

    it("preserves RegExp flags", () => {
      const matcher = resolveDirectiveMatcher(/\.js$/i);
      expect(matcher("file.JS")).toBe(true);
    });
  });

  describe("default patterns", () => {
    it("uses default string pattern when no pattern provided", () => {
      const matcher = resolveDirectiveMatcher(undefined, "*.js");
      expect(matcher("file.js")).toBe(true);
      expect(matcher("file.ts")).toBe(false);
    });

    it("uses default RegExp when no pattern provided", () => {
      const matcher = resolveDirectiveMatcher(undefined, /\.js$/);
      expect(matcher("file.js")).toBe(true);
      expect(matcher("file.ts")).toBe(false);
    });
  });
});

describe("resolvePatternWithValues", () => {
  describe("string patterns with interpolation", () => {
    it("interpolates simple values", () => {
      const matcher = resolvePatternWithValues("*.{ext}", "*.js", {
        ext: "js",
      });
      expect(matcher("file.js")).toBe(true);
      expect(matcher("file.ts")).toBe(false);
    });

    it("interpolates multiple values", () => {
      const matcher = resolvePatternWithValues("*.{ext}", "*.{js,ts}", {
        ext: "js|ts",
      });
      expect(matcher("file.js")).toBe(true);
      expect(matcher("file.ts")).toBe(true);
      expect(matcher("file.css")).toBe(false);
    });

    it("interpolates directory patterns", () => {
      const matcher = resolvePatternWithValues("src/*.{ext}", "src/*.js", {
        ext: "js",
      });
      expect(matcher("src/file.js")).toBe(true);
      expect(matcher("file.js")).toBe(false);
    });
  });

  describe("RegExp patterns", () => {
    it("uses RegExp objects without interpolation", () => {
      const matcher = resolvePatternWithValues(/\.js$/, "*.js", { ext: "js" });
      expect(matcher("file.js")).toBe(true);
      expect(matcher("file.ts")).toBe(false);
    });

    it("preserves RegExp flags", () => {
      const matcher = resolvePatternWithValues(/\.js$/i, "*.js", { ext: "js" });
      expect(matcher("file.JS")).toBe(true);
    });
  });

  describe("default patterns", () => {
    it("uses default string pattern with interpolation", () => {
      const matcher = resolvePatternWithValues(undefined, "*.{ext}", {
        ext: "js",
      });
      expect(matcher("file.js")).toBe(true);
      expect(matcher("file.ts")).toBe(false);
    });

    it("uses default RegExp without interpolation", () => {
      const matcher = resolvePatternWithValues(undefined, /\.js$/, {
        ext: "js",
      });
      expect(matcher("file.js")).toBe(true);
      expect(matcher("file.ts")).toBe(false);
    });
  });
});

describe("resolveRegExp", () => {
  it("should handle string patterns", () => {
    const regex = resolveRegExp("*.js");
    expect(regex.test("file.js")).toBe(true);
    expect(regex.test("file.ts")).toBe(false);
  });

  it("should handle multiple extensions", () => {
    const regex = resolveRegExp("*.{js,ts}");
    expect(regex.test("file.js")).toBe(true);
    expect(regex.test("file.ts")).toBe(true);
    expect(regex.test("file.css")).toBe(false);
  });

  it("should handle paths", () => {
    const regex = resolveRegExp("src/*.js");
    expect(regex.test("src/file.js")).toBe(true);
    expect(regex.test("file.js")).toBe(false);
  });

  it("should handle case sensitivity", () => {
    const regex = resolveRegExp("*.js");
    expect(regex.test("file.js")).toBe(true);
    expect(regex.test("file.JS")).toBe(false);

    const caseInsensitive = resolveRegExp("*.js/i");
    expect(caseInsensitive.test("file.js")).toBe(true);
    expect(caseInsensitive.test("file.JS")).toBe(true);
  });

  it("should handle RegExp objects", () => {
    const regex = resolveRegExp(/\.js$/);
    expect(regex.test("file.js")).toBe(true);
    expect(regex.test("file.ts")).toBe(false);
  });

  it("should handle RegExp flags", () => {
    const regex = resolveRegExp(/\.js$/i);
    expect(regex.test("file.js")).toBe(true);
    expect(regex.test("file.JS")).toBe(true);
  });

  it("should handle default patterns", () => {
    const regex = resolveRegExp(undefined, "*.js");
    expect(regex.test("file.js")).toBe(true);
    expect(regex.test("file.ts")).toBe(false);
  });

  it("should handle default RegExp patterns", () => {
    const regex = resolveRegExp(undefined, /\.js$/);
    expect(regex.test("file.js")).toBe(true);
    expect(regex.test("file.ts")).toBe(false);
  });

  it("should handle deserialized RegExp objects", () => {
    const deserialized: DeserializedRegExp = {
      source: "\\.js$",
      flags: "i",
      __isRegExp: true,
    };
    const regex = resolveRegExp(deserialized);
    expect(regex.test("file.js")).toBe(true);
    expect(regex.test("file.JS")).toBe(true);
  });
});

describe("parsePattern", () => {
  it("should convert '*.{js,ts}' to a regex that matches .js and .ts files", () => {
    const regex = parsePattern("*.{js,ts}");
    expect(regex).toBeInstanceOf(RegExp);
    expect(regex.source).toBe("^.*\\.(js|ts)$");
    expect(regex.test("file.js")).toBe(true);
    expect(regex.test("file.ts")).toBe(true);
    expect(regex.test("file.css")).toBe(false);
  });

  it("should convert '*.js' to a regex that matches .js files", () => {
    const regex = parsePattern("*.js");
    expect(regex).toBeInstanceOf(RegExp);
    expect(regex.source).toBe("^.*\\.js$");
    expect(regex.test("file.js")).toBe(true);
    expect(regex.test("file.ts")).toBe(false);
  });

  it("should convert 'src/*.js' to a regex that matches .js files in src/", () => {
    const regex = parsePattern("src/*.js");
    expect(regex).toBeInstanceOf(RegExp);
    expect(regex.source).toBe("^src\\/.*\\.js$");
    expect(regex.test("src/file.js")).toBe(true);
    expect(regex.test("file.js")).toBe(false);
  });
});

describe("rsolveRegExp direct output", () => {
  it("should return a RegExp object for directory patterns", () => {
    const regex = resolveRegExp("src/*.js");
    expect(regex).toBeInstanceOf(RegExp);
    expect(typeof regex.test).toBe("function");
    expect(regex.test("src/file.js")).toBe(true);
    expect(regex.test("file.js")).toBe(false);
  });
});
