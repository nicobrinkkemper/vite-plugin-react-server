import { describe, it, expect } from "vitest";
import { jsExtension, replaceExtension } from "vite-plugin-react-server/config";

describe("extMap", () => {
  describe("jsExtension", () => {
    it("should export .js as the JavaScript extension", () => {
      expect(jsExtension).toBe(".js");
    });
  });

  describe("replaceExtension", () => {
    const mockOptions = {
      build: {
        extensionMap: {
          ".node": ".node.js",
          ".ts": ".js",
          ".tsx": ".js",
          ".jsx": ".js"
        }
      }
    };

    it("should replace TypeScript extensions with JavaScript", () => {
      const result = replaceExtension("src/file.ts", mockOptions);
      expect(result).toBe("src/file.js");
    });

    it("should replace TSX extensions with JavaScript", () => {
      const result = replaceExtension("src/component.tsx", mockOptions);
      expect(result).toBe("src/component.js");
    });

    it("should replace JSX extensions with JavaScript", () => {
      const result = replaceExtension("src/component.jsx", mockOptions);
      expect(result).toBe("src/component.js");
    });

    it("should handle .mts extensions", () => {
      const result = replaceExtension("src/file.mts", mockOptions);
      expect(result).toBe("src/file.js");
    });

    it("should handle .cts extensions", () => {
      const result = replaceExtension("src/file.cts", mockOptions);
      expect(result).toBe("src/file.js");
    });

    it("should handle .mjs extensions", () => {
      const result = replaceExtension("src/file.mjs", mockOptions);
      expect(result).toBe("src/file.js");
    });

    it("should handle .cjs extensions", () => {
      const result = replaceExtension("src/file.cjs", mockOptions);
      expect(result).toBe("src/file.js");
    });

    it("should handle empty extension map", () => {
      const emptyOptions = {
        build: {
          extensionMap: {}
        }
      };
      // Even with empty extension map, BASE_PATTERNS.MODULE still applies
      const result = replaceExtension("src/file.ts", emptyOptions);
      expect(result).toBe("src/file.js");
    });

    it("should handle undefined extension map", () => {
      const undefinedOptions = {
        build: {
          extensionMap: undefined as any
        }
      };
      // Even with undefined extension map, BASE_PATTERNS.MODULE still applies
      const result = replaceExtension("src/file.ts", undefinedOptions);
      expect(result).toBe("src/file.js");
    });

    it("should handle multiple pattern matches (first match wins)", () => {
      const multipleOptions = {
        build: {
          extensionMap: {
            ".ts": ".mjs",
            ".tsx": ".js"
          }
        }
      };
      // First pattern should win
      const result = replaceExtension("src/file.ts", multipleOptions);
      expect(result).toBe("src/file.mjs");
    });

    it("should handle .node files specially", () => {
      const result = replaceExtension("src/addon.node", mockOptions);
      expect(result).toBe("src/addon.node.js");
    });

    it("should handle .node files with additional extensions", () => {
      const result = replaceExtension("src/addon.node.ts", mockOptions);
      expect(result).toBe("src/addon.node.js");
    });

    it("should leave non-module files unchanged", () => {
      const result = replaceExtension("src/file.css", mockOptions);
      expect(result).toBe("src/file.css");
    });

    it("should leave files without extensions unchanged", () => {
      const result = replaceExtension("src/file", mockOptions);
      expect(result).toBe("src/file");
    });

    it("should handle paths with multiple dots", () => {
      const result = replaceExtension("src/file.config.ts", mockOptions);
      expect(result).toBe("src/file.config.js");
    });

    it("should handle complex paths", () => {
      const result = replaceExtension("src/components/Button/Button.tsx", mockOptions);
      expect(result).toBe("src/components/Button/Button.js");
    });

    it("should handle relative paths", () => {
      const result = replaceExtension("./src/file.ts", mockOptions);
      expect(result).toBe("./src/file.js");
    });

    it("should handle absolute paths", () => {
      const result = replaceExtension("/absolute/path/file.ts", mockOptions);
      expect(result).toBe("/absolute/path/file.js");
    });

    it("should use custom extension mappings when provided", () => {
      const customOptions = {
        build: {
          extensionMap: {
            ".ts": ".esm.js",
            ".tsx": ".component.js"
          }
        }
      };
      
      expect(replaceExtension("src/file.ts", customOptions)).toBe("src/file.esm.js");
      expect(replaceExtension("src/component.tsx", customOptions)).toBe("src/component.component.js");
    });
  });
}); 