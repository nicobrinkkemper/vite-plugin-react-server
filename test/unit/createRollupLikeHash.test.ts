import { describe, it, expect } from "vitest";
import { createRollupLikeHash } from "vite-plugin-react-server/config";

// Guards against silent drift in the Rollup-like content hash used for
// client-component module IDs. Both `createModuleID` and `resolveOptions`
// route through this single implementation; if the hash output ever changes,
// hosted client modules will get new filenames and previously-built bundles
// will mismatch. These literal snapshots make any such change loud.
describe("createRollupLikeHash", () => {
  // A representative source roughly mirroring a "use client" module body.
  const sample =
    'export default function MyClient() { return null; }';

  describe("hashCharacters: base36 (default)", () => {
    it("hashes a representative source to a stable base36 value", () => {
      expect(createRollupLikeHash(sample, "base36")).toBe("p4aj8u");
    });

    it("defaults to base36 when no hashCharacters is provided", () => {
      expect(createRollupLikeHash(sample)).toBe(
        createRollupLikeHash(sample, "base36"),
      );
    });

    it("hashes empty input deterministically", () => {
      expect(createRollupLikeHash("", "base36")).toBe("1ojsg6m");
    });
  });

  describe("hashCharacters: base64", () => {
    it("hashes a representative source to a stable url-safe base64 value", () => {
      expect(createRollupLikeHash(sample, "base64")).toBe("WogH7g");
    });

    it("hashes empty input deterministically", () => {
      expect(createRollupLikeHash("", "base64")).toBe("2jmj7g");
    });
  });

  describe("hashCharacters: hex", () => {
    it("hashes a representative source to a stable 8-char hex prefix", () => {
      expect(createRollupLikeHash(sample, "hex")).toBe("5a8807ee");
    });

    it("hashes empty input to the canonical sha1-empty prefix", () => {
      // First 8 chars of sha1("") = "da39a3ee...".
      expect(createRollupLikeHash("", "hex")).toBe("da39a3ee");
    });
  });
});
