import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  setStashedResolve,
  setStashedGetSource,
  resolve,
  getSource,
  resolveClientImport,
  loadClientSource
} from "vite-plugin-react-server/helpers";
import type { ResolveHookContext } from "node:module";

describe("moduleResolver", () => {
  // Mock functions
  const mockResolve = vi.fn();
  const mockGetSource = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset stashed functions by setting them to null
    setStashedResolve(null as any);
    setStashedGetSource(null as any);
  });

  describe("setStashedResolve", () => {
    it("should store the resolve function", () => {
      const resolveFunction = vi.fn();
      setStashedResolve(resolveFunction);
      // We can't directly test the internal state, but we can test it through other functions
      expect(() => setStashedResolve(resolveFunction)).not.toThrow();
    });
  });

  describe("setStashedGetSource", () => {
    it("should store the getSource function", () => {
      const getSourceFunction = vi.fn();
      setStashedGetSource(getSourceFunction);
      // We can't directly test the internal state, but we can test it through other functions
      expect(() => setStashedGetSource(getSourceFunction)).not.toThrow();
    });
  });

  describe("resolve", () => {
    it("should add react-server condition if not present", async () => {
      const mockDefaultResolve = vi.fn().mockResolvedValue({
        url: "file:///test.js",
        shortCircuit: false
      });

      const context: ResolveHookContext = {
        conditions: ["node", "import"],
        parentURL: "file:///parent.js",
        importAttributes: {}
      };

      await resolve("test-module", context, mockDefaultResolve);

      expect(mockDefaultResolve).toHaveBeenCalledWith(
        "test-module",
        {
          ...context,
          conditions: ["node", "import", "react-server"]
        },
        mockDefaultResolve
      );
    });

    it("should not duplicate react-server condition if already present", async () => {
      const mockDefaultResolve = vi.fn().mockResolvedValue({
        url: "file:///test.js",
        shortCircuit: false
      });

      const context: ResolveHookContext = {
        conditions: ["node", "import", "react-server"],
        parentURL: "file:///parent.js",
        importAttributes: {}
      };

      await resolve("test-module", context, mockDefaultResolve);

      expect(mockDefaultResolve).toHaveBeenCalledWith(
        "test-module",
        context, // Should be unchanged since react-server is already present
        mockDefaultResolve
      );
    });

    it("should return the result from defaultResolve", async () => {
      const expectedResult = {
        url: "file:///resolved.js",
        shortCircuit: true
      };

      const mockDefaultResolve = vi.fn().mockResolvedValue(expectedResult);

      const context: ResolveHookContext = {
        conditions: ["node"],
        parentURL: "file:///parent.js",
        importAttributes: {}
      };

      const result = await resolve("test-module", context, mockDefaultResolve);

      expect(result).toEqual(expectedResult);
    });

    it("should stash the defaultResolve function", async () => {
      const mockDefaultResolve = vi.fn().mockResolvedValue({
        url: "file:///test.js",
        shortCircuit: false
      });

      const context: ResolveHookContext = {
        conditions: ["node"],
        parentURL: "file:///parent.js",
        importAttributes: {}
      };

      await resolve("test-module", context, mockDefaultResolve);

      // Test that the resolve function was stashed by calling resolveClientImport
      // which should not throw an error about missing stashed resolve
      await expect(
        resolveClientImport("client-module", "file:///parent.js")
      ).resolves.toBeDefined();
    });
  });

  describe("getSource", () => {
    it("should call defaultGetSource with correct parameters", async () => {
      const expectedSource = "export default 'test';";
      const mockDefaultGetSource = vi.fn().mockResolvedValue({
        source: expectedSource
      });

      const context = {
        format: "module",
        url: "file:///test.js"
      };

      const result = await getSource("file:///test.js", context, mockDefaultGetSource);

      expect(mockDefaultGetSource).toHaveBeenCalledWith(
        "file:///test.js",
        context,
        mockDefaultGetSource
      );
      expect(result).toEqual({ source: expectedSource });
    });

    it("should stash the defaultGetSource function", async () => {
      const mockDefaultGetSource = vi.fn().mockResolvedValue({
        source: "test source"
      });

      const context = {
        format: "module",
        url: "file:///test.js"
      };

      await getSource("file:///test.js", context, mockDefaultGetSource);

      // Test that the getSource function was stashed by calling loadClientSource
      // which should not throw an error about missing stashed getSource
      await expect(
        loadClientSource("file:///test.js")
      ).resolves.toBeDefined();
    });
  });

  describe("resolveClientImport", () => {
    it("should throw error if stashedResolve is null", async () => {
      await expect(
        resolveClientImport("test-module", "file:///parent.js")
      ).rejects.toThrow("Expected resolve to have been called before transformSource");
    });

    it("should resolve client import successfully", async () => {
      const mockResolveFunction = vi.fn().mockResolvedValue({
        url: "file:///resolved-client.js",
        shortCircuit: false
      });

      setStashedResolve(mockResolveFunction);

      const result = await resolveClientImport("client-module", "file:///parent.js");

      expect(mockResolveFunction).toHaveBeenCalledWith(
        "client-module",
        {
          conditions: ["node", "import"],
          parentURL: "file:///parent.js",
          importAttributes: {}
        },
        mockResolveFunction
      );
      expect(result).toBe("file:///resolved-client.js");
    });

    it("should throw error on resolution failure", async () => {
      const mockResolveFunction = vi.fn().mockRejectedValue(new Error("Resolution failed"));

      setStashedResolve(mockResolveFunction);

      await expect(resolveClientImport("failing-module", "file:///parent.js")).rejects.toThrow("Resolution failed");
    });

    it("should use correct conditions for client import", async () => {
      const mockResolveFunction = vi.fn().mockResolvedValue({
        url: "file:///resolved.js",
        shortCircuit: false
      });

      setStashedResolve(mockResolveFunction);

      await resolveClientImport("test-module", "file:///parent.js");

      expect(mockResolveFunction).toHaveBeenCalledWith(
        "test-module",
        expect.objectContaining({
          conditions: ["node", "import"]
        }),
        mockResolveFunction
      );
    });
  });

  describe("loadClientSource", () => {
    it("should throw error if stashedGetSource is null", async () => {
      await expect(
        loadClientSource("file:///test.js")
      ).rejects.toThrow("Expected getSource to have been called before loadClientSource");
    });

    it("should load client source successfully", async () => {
      const expectedSource = "export const test = 'client code';";
      const mockGetSourceFunction = vi.fn().mockResolvedValue({
        source: expectedSource
      });

      setStashedGetSource(mockGetSourceFunction);

      const result = await loadClientSource("file:///client.js");

      expect(mockGetSourceFunction).toHaveBeenCalledWith(
        "file:///client.js",
        {
          format: "module",
          url: "file:///client.js"
        },
        mockGetSourceFunction
      );
      expect(result).toBe(expectedSource);
    });

    it("should throw error on source loading failure", async () => {
      const mockGetSourceFunction = vi.fn().mockRejectedValue(new Error("Source loading failed"));

      setStashedGetSource(mockGetSourceFunction);

      await expect(loadClientSource("file:///failing.js")).rejects.toThrow("Source loading failed");
    });

    it("should use module format for loading source", async () => {
      const mockGetSourceFunction = vi.fn().mockResolvedValue({
        source: "test source"
      });

      setStashedGetSource(mockGetSourceFunction);

      await loadClientSource("file:///test.js");

      expect(mockGetSourceFunction).toHaveBeenCalledWith(
        "file:///test.js",
        expect.objectContaining({
          format: "module"
        }),
        mockGetSourceFunction
      );
    });

    it("should handle different source types", async () => {
      const testCases = [
        { source: "string source" },
        { source: new ArrayBuffer(8) },
        { source: new SharedArrayBuffer(8) },
        { source: new Uint8Array([1, 2, 3, 4]) }
      ];

      for (const testCase of testCases) {
        const mockGetSourceFunction = vi.fn().mockResolvedValue(testCase);
        setStashedGetSource(mockGetSourceFunction);

        const result = await loadClientSource("file:///test.js");
        expect(result).toBe(testCase.source);
      }
    });
  });

  describe("integration tests", () => {
    it("should work end-to-end with resolve and resolveClientImport", async () => {
      const mockDefaultResolve = vi.fn().mockResolvedValue({
        url: "file:///resolved.js",
        shortCircuit: false
      });

      const context: ResolveHookContext = {
        conditions: ["node"],
        parentURL: "file:///parent.js",
        importAttributes: {}
      };

      // First call resolve to stash the function
      await resolve("initial-module", context, mockDefaultResolve);

      // Then use resolveClientImport
      const result = await resolveClientImport("client-module", "file:///parent.js");

      expect(result).toBe("file:///resolved.js");
    });

    it("should work end-to-end with getSource and loadClientSource", async () => {
      const expectedSource = "export default 'integrated test';";
      const mockDefaultGetSource = vi.fn().mockResolvedValue({
        source: expectedSource
      });

      const context = {
        format: "module",
        url: "file:///test.js"
      };

      // First call getSource to stash the function
      await getSource("file:///test.js", context, mockDefaultGetSource);

      // Then use loadClientSource
      const result = await loadClientSource("file:///client.js");

      expect(result).toBe(expectedSource);
    });
  });
}); 