import { describe, it, expect } from "vitest";
import { resolveRegExp } from "../../plugin/config/resolveRegExp.js";
import { resolvePatternWithValues } from "../../plugin/config/resolvePatternWithValues.js";
import type { DeserializedRegExp } from "../../plugin/types.js";

describe("resolveRegExp", () => {
  describe("string patterns", () => {
    it("matches simple file extensions", () => {
      const matcher = resolveRegExp("*.js")     ;
      expect(matcher.test("file.js")).toBe(true);
      expect(matcher.test("file.ts")).toBe(false);
    });

    it("matches multiple extensions", () => {
      const matcher = resolveRegExp("*.{js,ts}");
      expect(matcher.test("file.js")).toBe(true);
      expect(matcher.test("file.ts")).toBe(true);
      expect(matcher.test("file.css")).toBe(false);
    });

    it("matches directory patterns", () => {
      const matcher = resolveRegExp("src/*.js");
      expect(matcher.test("src/file.js")).toBe(true);
      expect(matcher.test("file.js")).toBe(false);
    });

    it("handles case sensitivity", () => {
      const matcher = resolveRegExp("*.js");    
      expect(matcher.test("file.JS")).toBe(false);
      
      const caseInsensitive = resolveRegExp("*.js/i");
      expect(caseInsensitive.test("file.JS")).toBe(true);
    });
  });

  describe("RegExp patterns", () => {
    it("uses RegExp objects as-is", () => {
      const matcher = resolveRegExp(/\.js$/);
      expect(matcher.test("file.js")).toBe(true);
      expect(matcher.test("file.ts")).toBe(false);
    });

    it("preserves RegExp flags", () => {
      const matcher = resolveRegExp(/\.js$/i);
      expect(matcher.test("file.JS")).toBe(true);
    });
  });

  describe("default patterns", () => {
    it("uses default string pattern when no pattern provided", () => {
      const matcher = resolveRegExp(undefined, "*.js");
      expect(matcher.test("file.js")).toBe(true);
      expect(matcher.test("file.ts")).toBe(false);
    });

    it("uses default RegExp when no pattern provided", () => {
      const matcher = resolveRegExp(undefined, /\.js$/);
      expect(matcher.test("file.js")).toBe(true);
      expect(matcher.test("file.ts")).toBe(false);
    });
  });

  it("should handle string patterns", () => {
    const pattern = resolveRegExp("*.js");
    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern.test("file.js")).toBe(true);
    expect(pattern.test("file.ts")).toBe(false);
  });

  it("should handle multiple extensions", () => {
    const pattern = resolveRegExp("*.{js,ts}");
    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern.test("file.js")).toBe(true);
    expect(pattern.test("file.ts")).toBe(true);
    expect(pattern.test("file.css")).toBe(false);
  });

  it("should handle paths", () => {
    const pattern = resolveRegExp("src/*.js");
    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern.test("src/file.js")).toBe(true);
    expect(pattern.test("file.js")).toBe(false);
  });

  it("should handle case sensitivity", () => {
    const pattern = resolveRegExp("*.js");
    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern.test("file.js")).toBe(true);
    expect(pattern.test("file.JS")).toBe(false);

    const caseInsensitivePattern = resolveRegExp("*.js/i");
    expect(caseInsensitivePattern).toBeInstanceOf(RegExp);
    expect(caseInsensitivePattern.test("file.js")).toBe(true);
    expect(caseInsensitivePattern.test("file.JS")).toBe(true);
  });

  it("should handle RegExp objects", () => {
    const pattern = resolveRegExp(/\.js$/);
    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern.test("file.js")).toBe(true);
    expect(pattern.test("file.ts")).toBe(false);
  });

  it("should handle RegExp flags", () => {
    const pattern = resolveRegExp(/\.js$/i);
    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern.test("file.js")).toBe(true);
    expect(pattern.test("file.JS")).toBe(true);
  });

  it("should handle default patterns", () => {
    const pattern = resolveRegExp(undefined, "*.js");
    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern.test("file.js")).toBe(true);
    expect(pattern.test("file.ts")).toBe(false);
  });

  it("should handle default RegExp patterns", () => {
    const pattern = resolveRegExp(undefined, /\.js$/);
    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern.test("file.js")).toBe(true);
    expect(pattern.test("file.ts")).toBe(false);
  });

  it("should handle deserialized RegExp objects", () => {
    const deserialized: DeserializedRegExp = {
      source: "\\.js$",
      flags: "i",
      __isRegExp: true,
    };
    const pattern = resolveRegExp(deserialized);
    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern.test("file.js")).toBe(true);
    expect(pattern.test("file.JS")).toBe(true);
  });
});

describe("resolvePatternWithValues", () => {
  describe("string patterns with interpolation", () => {
    it("interpolates simple values", () => {
      const matcher = resolvePatternWithValues(
        "*.{ext}",
        "*.js",
        { ext: "js" }
      );
      expect(matcher("file.js")).toBe(true);
      expect(matcher("file.ts")).toBe(false);
    });

    it("interpolates multiple values", () => {
      const matcher = resolvePatternWithValues(
        "*.{ext}",
        "*.{js,ts}",
        { ext: "js|ts" }
      );
      expect(matcher("file.js")).toBe(true);
      expect(matcher("file.ts")).toBe(true);
      expect(matcher("file.css")).toBe(false);
    });

    it("interpolates directory patterns", () => {
      const matcher = resolvePatternWithValues(
        "src/*.{ext}",
        "src/*.js",
        { ext: "js" }
      );
      expect(matcher("src/file.js")).toBe(true);
      expect(matcher("file.js")).toBe(false);
    });
  });

  describe("RegExp patterns", () => {
    it("uses RegExp objects without interpolation", () => {
      const matcher = resolvePatternWithValues(
        /\.js$/,
        "*.js",
        { ext: "js" }
      );
      expect(matcher("file.js")).toBe(true);
      expect(matcher("file.ts")).toBe(false);
    });

    it("preserves RegExp flags", () => {
      const matcher = resolvePatternWithValues(
        /\.js$/i,
        "*.js",
        { ext: "js" }
      );
      expect(matcher("file.JS")).toBe(true);
    });
  });

  describe("default patterns", () => {
    it("uses default string pattern with interpolation", () => {
      const matcher = resolvePatternWithValues(
        undefined,
        "*.{ext}",
        { ext: "js" }
      );
      expect(matcher("file.js")).toBe(true);
      expect(matcher("file.ts")).toBe(false);
    });

    it("uses default RegExp without interpolation", () => {
      const matcher = resolvePatternWithValues(
        undefined,
        /\.js$/,
        { ext: "js" }
      );
      expect(matcher("file.js")).toBe(true);
      expect(matcher("file.ts")).toBe(false);
    });
  });
}); 