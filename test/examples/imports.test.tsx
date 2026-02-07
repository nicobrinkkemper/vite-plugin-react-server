import { describe, it, expect } from "vitest";
import { getCondition } from "vite-plugin-react-server/config";

describe("imports test", () => {
  const condition = getCondition();
  
  it("should detect environment", () => {
    expect(condition).toMatch(/^(react-server|react-client)$/);
  });

  it("should import main plugin", async () => {
    const { vitePluginReactServer } = await import("vite-plugin-react-server");
    expect(vitePluginReactServer).toBeDefined();
    expect(typeof vitePluginReactServer).toBe("function");
  });

  if (condition === "react-server") {
    it("should handle server environment", async () => {
      const serverModule = await import("vite-plugin-react-server/server");
      expect(serverModule).toBeDefined();
      await expect(import("vite-plugin-react-server/client")).rejects.toThrow();
    });

    it("should handle vendor exports", async () => {
      const vendorServerModule = await import(
        "vite-plugin-react-server/vendor.server"
      );
      expect(vendorServerModule).toBeDefined();
      await expect(
        import("vite-plugin-react-server/vendor.client")
      ).rejects.toThrow();
    });

    it("should handle stream exports", async () => {
      const streamServerModule = await import(
        "vite-plugin-react-server/stream/server"
      );
      expect(streamServerModule).toBeDefined();
      await expect(
        import("vite-plugin-react-server/stream/client")
      ).rejects.toThrow();
    });
  }

  if (condition === "react-client") {
    it("should handle client environment", async () => {
      const clientModule = await import("vite-plugin-react-server/client");
      expect(clientModule).toBeDefined();
      await expect(import("vite-plugin-react-server/server")).rejects.toThrow();
    });

    it("should handle static environment", async () => {
      const staticModule = await import("vite-plugin-react-server/static");
      expect(staticModule).toBeDefined();
      await expect(import("vite-plugin-react-server/server")).rejects.toThrow();
    });

    it("should handle vendor exports", async () => {
      const vendorClientModule = await import(
        "vite-plugin-react-server/vendor.client"
      );
      expect(vendorClientModule).toBeDefined();
      await expect(
        import("vite-plugin-react-server/vendor.server")
      ).rejects.toThrow();
    });

    it("should handle stream exports", async () => {
      const streamClientModule = await import(
        "vite-plugin-react-server/stream/client"
      );
      expect(streamClientModule).toBeDefined();
      await expect(
        import("vite-plugin-react-server/stream/server")
      ).rejects.toThrow();
    });

    it("should handle dev-server exports", async () => {
      const devServerModule = await import(
        "vite-plugin-react-server/dev-server"
      );
      expect(devServerModule).toBeDefined();
      await expect(import("vite-plugin-react-server/server")).rejects.toThrow();
    });
  }
});