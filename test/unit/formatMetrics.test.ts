import { describe, it, expect, vi } from "vitest";
import { formatMetrics, logMetrics } from "vite-plugin-react-server/metrics";
import type { RenderMetrics } from "vite-plugin-react-server/metrics";

describe("formatMetrics", () => {
  const mockMetrics: RenderMetrics = {
    route: "/test",
    htmlSize: 5120,
    rscSize: 2048,
    chunks: 5,
    chunkRate: 2.5,
    processingTime: 150.75,
    memoryUsage: {
      rss: 52428800, // 50MB
      heapTotal: 41943040, // 40MB
      heapUsed: 31457280, // 30MB
      external: 10485760, // 10MB
      arrayBuffers: 0
    },
    streamMetrics: {
      chunks: 5,
      bytes: 2048,
      duration: 125.5,
      backpressureCount: 2,
      errorCount: 0,
      startTime: Date.now()
    },
    htmlSizes: new Map([["test", 5120]]),
    rscSizes: new Map([["test", 2048]])
  };

  describe("formatMetrics", () => {
    it("should format all metrics correctly", () => {
      const result = formatMetrics(mockMetrics);
      
      expect(result).toContain("Route: /test");
      expect(result).toContain("Size: 2.00KB");
      expect(result).toContain("Chunks: 5 (2.50 chunks/s)");
      expect(result).toContain("Processing Time: 150.75ms");
      expect(result).toContain("RSS: 50.00MB");
      expect(result).toContain("Heap Total: 40.00MB");
      expect(result).toContain("Heap Used: 30.00MB");
      expect(result).toContain("External: 10.00MB");
      expect(result).toContain("Duration: 125.50ms");
      expect(result).toContain("Backpressure: 2");
      expect(result).toContain("Drain: 1");
      expect(result).toContain("Errors: 0");
    });

    it("should handle zero values correctly", () => {
      const zeroMetrics: RenderMetrics = {
        route: "/",
        htmlSize: 0,
        rscSize: 0,
        chunks: 0,
        chunkRate: 0,
        processingTime: 0,
        memoryUsage: {
          rss: 0,
          heapTotal: 0,
          heapUsed: 0,
          external: 0,
          arrayBuffers: 0
        },
        streamMetrics: {
          chunks: 0,
          bytes: 0,
          duration: 0,
          backpressureCount: 0,
          errorCount: 0,
          startTime: Date.now()
        },
        htmlSizes: new Map(),
        rscSizes: new Map()
      };

      const result = formatMetrics(zeroMetrics);
      
      expect(result).toContain("Route: /");
      expect(result).toContain("Size: 0.00KB");
      expect(result).toContain("Chunks: 0 (0.00 chunks/s)");
      expect(result).toContain("Processing Time: 0.00ms");
      expect(result).toContain("RSS: 0.00MB");
      expect(result).toContain("Duration: 0.00ms");
    });

    it("should handle large memory values correctly", () => {
      const largeMetrics: RenderMetrics = {
        ...mockMetrics,
        memoryUsage: {
          rss: 1073741824, // 1GB
          heapTotal: 536870912, // 512MB
          heapUsed: 268435456, // 256MB
          external: 134217728, // 128MB
          arrayBuffers: 0
        }
      };

      const result = formatMetrics(largeMetrics);
      
      expect(result).toContain("RSS: 1024.00MB");
      expect(result).toContain("Heap Total: 512.00MB");
      expect(result).toContain("Heap Used: 256.00MB");
      expect(result).toContain("External: 128.00MB");
    });

    it("should handle fractional values correctly", () => {
      const fractionalMetrics: RenderMetrics = {
        ...mockMetrics,
        rscSize: 1536, // 1.5KB
        chunkRate: 3.333,
        processingTime: 123.456,
        streamMetrics: {
          chunks: 3,
          bytes: 1536,
          duration: 99.999,
          backpressureCount: 1,
          errorCount: 2,
          startTime: Date.now()
        }
      };

      const result = formatMetrics(fractionalMetrics);
      
      expect(result).toContain("Size: 1.50KB");
      expect(result).toContain("3.33 chunks/s");
      expect(result).toContain("Processing Time: 123.46ms");
      expect(result).toContain("Duration: 100.00ms");
    });

    it("should handle special route names", () => {
      const specialRouteMetrics: RenderMetrics = {
        ...mockMetrics,
        route: "/api/users/[id]"
      };

      const result = formatMetrics(specialRouteMetrics);
      expect(result).toContain("Route: /api/users/[id]");
    });

    it("should handle empty route", () => {
      const emptyRouteMetrics: RenderMetrics = {
        ...mockMetrics,
        route: ""
      };

      const result = formatMetrics(emptyRouteMetrics);
      expect(result).toContain("Route: ");
    });

    it("should return trimmed string without leading/trailing whitespace", () => {
      const result = formatMetrics(mockMetrics);
      expect(result).not.toMatch(/^\s/);
      expect(result).not.toMatch(/\s$/);
    });

    it("should include all required sections", () => {
      const result = formatMetrics(mockMetrics);
      
      // Check for section headers
      expect(result).toContain("Route:");
      expect(result).toContain("Size:");
      expect(result).toContain("Chunks:");
      expect(result).toContain("Processing Time:");
      expect(result).toContain("Memory:");
      expect(result).toContain("Stream:");
    });
  });

  describe("logMetrics", () => {
    it("should log formatted metrics using provided logger", () => {
      const mockLogger = {
        info: vi.fn()
      };

      logMetrics(mockMetrics, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledOnce();
      expect(mockLogger.info).toHaveBeenCalledWith(formatMetrics(mockMetrics));
    });

    it("should use console as default logger", () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      logMetrics(mockMetrics);

      expect(consoleSpy).toHaveBeenCalledOnce();
      expect(consoleSpy).toHaveBeenCalledWith(formatMetrics(mockMetrics));
      
      consoleSpy.mockRestore();
    });

    it("should handle custom logger with different method names", () => {
      const customLogger = {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn()
      };

      logMetrics(mockMetrics, customLogger);

      expect(customLogger.info).toHaveBeenCalledOnce();
      expect(customLogger.debug).not.toHaveBeenCalled();
      expect(customLogger.warn).not.toHaveBeenCalled();
    });
  });
}); 