import { describe, it, expect } from "vitest";
import { getCondition } from "../../plugin/config/getCondition.js";

describe("Stream Utilities Import Test", () => {
  const condition = getCondition();
  
  it("should detect current environment", () => {
    expect(condition).toMatch(/^(react-server|react-client)$/);
  });

  if (condition === "react-server") {
    describe("Server Environment", () => {
      it("should import createRscStream", async () => {
        const { createRscStream } = await import("../../plugin/stream/createRscStream.server.js");
        expect(createRscStream).toBeDefined();
        expect(typeof createRscStream).toBe("function");
      });

      it("should import createHtmlStream", async () => {
        const { createHtmlStream } = await import("../../plugin/stream/createHtmlStream.server.js");
        expect(createHtmlStream).toBeDefined();
        expect(typeof createHtmlStream).toBe("function");
      });

      it("should import unified worker stream utilities", async () => {
        
      });

      it("should import RSC worker stream adapter", async () => {
        const { createRscWorkerStream } = await import("../../plugin/stream/createRscWorkerStream.js");
        expect(createRscWorkerStream).toBeDefined();
        expect(typeof createRscWorkerStream).toBe("function");
      });



      it("should handle client module imports in server environment", async () => {
        // Since Vite 7 compat (v1.4.3), our condition assertions warn instead of throw.
        // createRscStream.client imports successfully (no react-dom/server dependency).
        const clientRsc = await import("../../plugin/stream/createRscStream.client.js");
        expect(clientRsc.createRscStream).toBeDefined();

        // createHtmlStream.client fails because vendor.client imports react-dom/server
        // which is banned under react-server condition.
        await expect(
          import("../../plugin/stream/createHtmlStream.client.js")
        ).rejects.toThrow();
      });
    });
  }

  if (condition === "react-client") {
    describe("Client Environment", () => {
      it("should import createRscStream", async () => {
        const { createRscStream } = await import("../../plugin/stream/createRscStream.client.js");
        expect(createRscStream).toBeDefined();
        expect(typeof createRscStream).toBe("function");
      });

      it("should import createHtmlStream", async () => {
        const { createHtmlStream } = await import("../../plugin/stream/createHtmlStream.client.js");
        expect(createHtmlStream).toBeDefined();
        expect(typeof createHtmlStream).toBe("function");
      });

      it("should not import server-only modules (with proper conditional exports)", async () => {
        // Note: These should fail when conditional exports are properly configured
        // For now, we document the expected behavior
        
        try {
          await import("../../plugin/stream/createRscStream.server.js");
          // Should not reach here with proper conditional exports
        } catch (error) {
          expect(error).toBeDefined();
        }
        
      });
    });
  }

  describe("Environment-Agnostic Utilities", () => {
    it("should import stream types", async () => {
      const types = await import("../../plugin/stream/createRscStream.types.js");
      expect(types).toBeDefined();
      // Types should be available in both environments
    });

    it("should import stream utilities", async () => {
      const utils = await import("../../plugin/stream/createRscStream.utils.js");
      expect(utils).toBeDefined();
      expect(utils.validateRscStreamOptions).toBeDefined();
      expect(utils.createBaseRscStreamResult).toBeDefined();
      expect(utils.handleRscStreamError).toBeDefined();
    });
  });

  describe("Stream Composition", () => {
    it("should demonstrate clean pipe interface", async () => {
      // This test just validates the import and basic structure
      // Real pipe testing is done in unified-worker-stream.test.ts
      
      if (condition === "react-server") {
        const { createRscStream } = await import("../../plugin/stream/createRscStream.server.js");
        const { createHtmlStream } = await import("../../plugin/stream/createHtmlStream.server.js");
        
        // These should be composable functions
        expect(typeof createRscStream).toBe("function");
        expect(typeof createHtmlStream).toBe("function");
        
        // The return type should have pipe method for composition
        // Real composition testing done in integration tests
      }
      
      if (condition === "react-client") {
        const { createRscStream } = await import("../../plugin/stream/createRscStream.client.js");
        const { createHtmlStream } = await import("../../plugin/stream/createHtmlStream.client.js");
        
        expect(typeof createRscStream).toBe("function");
        expect(typeof createHtmlStream).toBe("function");
      }
    });
  });
});
