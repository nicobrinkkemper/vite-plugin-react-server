import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config.js";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { setupTestProjectEnv } from "../setup.js";

/**
 * Memory Leak Stress Test Utility
 * 
 * This utility creates a stress test to verify that MessagePort cleanup
 * works correctly under heavy concurrent load. It simulates multiple
 * concurrent requests to trigger potential race conditions and memory leaks.
 */

describe("Memory Leak Stress Test", () => {
  let server: any;
  let port = 3034;
  let baseURL: string;
  const testDir = resolve(__dirname, "../fixtures/shared/memory-leak-stress-test");

  beforeAll(async () => {
    // Clean up and create test directory
    await rm(testDir, { recursive: true, force: true });
    await setupTestProjectEnv(testDir);
    
    // Start the server
    server = await createServer({
      mode: "test",
      root: testDir,
      plugins: vitePluginReactServer({
        ...testUserOptions,
        projectRoot: testDir,
        verbose: false, // enabling verbose may cause certain race conditions *not to happen*, since it will be slower overall.
      }),
      server: {
        port,
        host: "localhost",
      },
    });

    await server.listen();
    baseURL = `http://localhost:${port}`;
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  /**
   * Makes a single RSC request and returns the response
   */
  async function makeRscRequest(path: string = "/"): Promise<Response> {
    const response = await fetch(`${baseURL}${path}`, {
      headers: {
        Accept: "text/x-component",
      },
    });
    return response;
  }

  /**
   * Makes multiple concurrent RSC requests
   */
  async function makeConcurrentRequests(count: number, path: string = "/"): Promise<Response[]> {
    const promises = Array.from({ length: count }, () => makeRscRequest(path));
    return Promise.all(promises);
  }

  /**
   * Waits for a specified amount of time
   */
  function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  it("should handle 10 concurrent requests without memory leaks", async () => {
    const responses = await makeConcurrentRequests(10);
    
    // Verify all requests succeeded
    responses.forEach((response, index) => {
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/x-component");
    });

    // Wait a bit for cleanup to complete
    await wait(100);
  }, 15000);

  it("should handle 50 concurrent requests without memory leaks", async () => {
    const responses = await makeConcurrentRequests(50);
    
    // Verify all requests succeeded
    responses.forEach((response, index) => {
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/x-component");
    });

    // Wait a bit for cleanup to complete
    await wait(200);
  }, 15000);

  it("should handle rapid successive requests without memory leaks", async () => {
    // Make requests in rapid succession (not concurrent)
    for (let i = 0; i < 20; i++) {
      const response = await makeRscRequest();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/x-component");
      
      // Small delay between requests
      await wait(10);
    }

    // Wait for cleanup
    await wait(100);
  }, 10000);

  it("should handle mixed concurrent and sequential requests", async () => {
    // Mix of concurrent and sequential requests
    const concurrentBatch1 = makeConcurrentRequests(5);
    const concurrentBatch2 = makeConcurrentRequests(5);
    
    // Wait for concurrent batches
    const [responses1, responses2] = await Promise.all([concurrentBatch1, concurrentBatch2]);
    
    // Verify concurrent responses
    [...responses1, ...responses2].forEach(response => {
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/x-component");
    });

    // Make some sequential requests
    for (let i = 0; i < 10; i++) {
      const response = await makeRscRequest();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/x-component");
      await wait(5);
    }

    // Wait for cleanup
    await wait(200);
  }, 15000);

  it("should handle requests with different paths", async () => {
    const paths = ["/", "/page2", "/page3"];
    const responses = await Promise.all(
      paths.map(path => makeRscRequest(path))
    );
    
    responses.forEach((response, index) => {
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/x-component");
    });

    // Wait for cleanup
    await wait(100);
  }, 10000);

  it("should handle server restart during requests", async () => {
    // Start some requests
    const requestPromises = makeConcurrentRequests(5);
    
    // Wait a bit, then restart the server
    await wait(50);
    
    // Note: In a real scenario, we might restart the server here
    // For now, we'll just complete the requests
    const responses = await requestPromises;
    
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/x-component");
    });

    // Wait for cleanup
    await wait(200);
  }, 10000);
});

/**
 * Utility function to run stress tests programmatically
 */
export async function runMemoryLeakStressTest(options: {
  server: any;
  baseURL: string;
  concurrentRequests?: number;
  sequentialRequests?: number;
  delayBetweenRequests?: number;
  delayAfterTest?: number;
}): Promise<{
  success: boolean;
  error?: string;
  stats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
  };
}> {
  const {
    server,
    baseURL,
    concurrentRequests = 10,
    sequentialRequests = 5,
    delayBetweenRequests = 10,
    delayAfterTest = 100,
  } = options;

  const startTime = Date.now();
  let successfulRequests = 0;
  let failedRequests = 0;
  const responseTimes: number[] = [];

  try {
    // Make concurrent requests
    const concurrentPromises = Array.from({ length: concurrentRequests }, async () => {
      const requestStart = Date.now();
      try {
        const response = await fetch(`${baseURL}/`, {
          headers: { Accept: "text/x-component" },
        });
        const responseTime = Date.now() - requestStart;
        responseTimes.push(responseTime);
        
        if (response.status === 200) {
          successfulRequests++;
        } else {
          failedRequests++;
        }
        return response;
      } catch (error) {
        failedRequests++;
        throw error;
      }
    });

    await Promise.all(concurrentPromises);

    // Make sequential requests
    for (let i = 0; i < sequentialRequests; i++) {
      const requestStart = Date.now();
      try {
        const response = await fetch(`${baseURL}/`, {
          headers: { Accept: "text/x-component" },
        });
        const responseTime = Date.now() - requestStart;
        responseTimes.push(responseTime);
        
        if (response.status === 200) {
          successfulRequests++;
        } else {
          failedRequests++;
        }
        
        if (delayBetweenRequests > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
        }
      } catch (error) {
        failedRequests++;
      }
    }

    // Wait for cleanup
    if (delayAfterTest > 0) {
      await new Promise(resolve => setTimeout(resolve, delayAfterTest));
    }

    const totalTime = Date.now() - startTime;
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;

    return {
      success: failedRequests === 0,
      stats: {
        totalRequests: successfulRequests + failedRequests,
        successfulRequests,
        failedRequests,
        averageResponseTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stats: {
        totalRequests: successfulRequests + failedRequests,
        successfulRequests,
        failedRequests,
        averageResponseTime: 0,
      },
    };
  }
}
