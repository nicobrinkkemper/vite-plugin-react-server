import { describe, it, expect } from "vitest";
import { resolveJsxOverride } from "../../plugin/environments/resolveJsxOverride.js";

describe("resolveJsxOverride", () => {
  describe.each([6, 7])("Vite %i (esbuild)", (viteMajor) => {
    it("defaults to the automatic JSX runtime when the user set no JSX mode", () => {
      expect(
        resolveJsxOverride({
          viteMajor,
          command: "serve",
          esbuild: undefined,
          oxc: undefined,
        })
      ).toEqual({ esbuild: { jsx: "automatic" } });
      expect(
        resolveJsxOverride({
          viteMajor,
          command: "build",
          esbuild: { target: "es2022" },
          oxc: undefined,
        })
      ).toEqual({
        esbuild: { target: "es2022", jsx: "automatic", jsxDev: false },
      });
    });

    it.each(["transform", "preserve", "automatic"] as const)(
      "keeps a user-set esbuild.jsx (%s)",
      (jsx) => {
        expect(
          resolveJsxOverride({
            viteMajor,
            command: "build",
            esbuild: { jsx },
            oxc: undefined,
          })
        ).toEqual({ esbuild: { jsx, jsxDev: false } });
        expect(
          resolveJsxOverride({
            viteMajor,
            command: "serve",
            esbuild: { jsx },
            oxc: undefined,
          })
        ).toEqual({});
      }
    );

    it("keeps the classic transform for a user-set factory or fragment", () => {
      expect(
        resolveJsxOverride({
          viteMajor,
          command: "build",
          esbuild: { jsxFactory: "h" },
          oxc: undefined,
        })
      ).toEqual({ esbuild: { jsxFactory: "h", jsxDev: false } });
      expect(
        resolveJsxOverride({
          viteMajor,
          command: "serve",
          esbuild: { jsxFragment: "Fragment" },
          oxc: undefined,
        })
      ).toEqual({});
    });

    it("leaves a disabled esbuild alone", () => {
      expect(
        resolveJsxOverride({
          viteMajor,
          command: "build",
          esbuild: false,
          oxc: undefined,
        })
      ).toEqual({});
    });
  });

  describe("Vite 8 (Oxc)", () => {
    it("never sets the esbuild key and adds nothing in dev", () => {
      expect(
        resolveJsxOverride({
          viteMajor: 8,
          command: "serve",
          esbuild: undefined,
          oxc: undefined,
        })
      ).toEqual({});
      expect(
        resolveJsxOverride({
          viteMajor: 8,
          command: "build",
          esbuild: undefined,
          oxc: undefined,
        })
      ).toEqual({ oxc: { jsx: { development: false } } });
    });

    it("keeps the user's oxc settings and only turns the dev transform off for builds", () => {
      expect(
        resolveJsxOverride({
          viteMajor: 8,
          command: "build",
          esbuild: undefined,
          oxc: { target: "es2022", jsx: { runtime: "classic" } },
        })
      ).toEqual({
        oxc: {
          target: "es2022",
          jsx: { runtime: "classic", development: false },
        },
      });
    });

    it("leaves a disabled oxc alone", () => {
      expect(
        resolveJsxOverride({
          viteMajor: 8,
          command: "build",
          esbuild: undefined,
          oxc: false,
        })
      ).toEqual({});
    });
  });
});
