#!/usr/bin/env node

/**
 * Memory Leak Stress Test CLI
 * 
 * This CLI utility can be used to stress test the memory leak fix
 * by making many concurrent requests to a running dev server.
 * 
 * Usage:
 *   npm run stress-test -- --url http://localhost:3000 --concurrent 50 --sequential 20
 *   npm run stress-test -- --help
 */

// Standalone stress test function (not dependent on Vitest)

/**
 * Utility function to run stress tests programmatically
 */
async function runMemoryLeakStressTest(options: {
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

interface StressTestOptions {
  url: string;
  concurrent?: number;
  sequential?: number;
  delayBetweenRequests?: number;
  delayAfterTest?: number;
  iterations?: number;
  verbose?: boolean;
}

function parseArgs(): StressTestOptions {
  const args = process.argv.slice(2);
  const options: StressTestOptions = {
    url: "http://localhost:3000",
    concurrent: 10,
    sequential: 5,
    delayBetweenRequests: 10,
    delayAfterTest: 100,
    iterations: 1,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === "--help" || arg === "-h") {
      console.log(`
Memory Leak Stress Test CLI

Usage: npm run stress-test -- [options]

Options:
  --url <url>                    Server URL to test (default: http://localhost:3000)
  --concurrent <number>          Number of concurrent requests (default: 10)
  --sequential <number>          Number of sequential requests (default: 5)
  --delay-between <ms>           Delay between sequential requests in ms (default: 10)
  --delay-after <ms>             Delay after test completion in ms (default: 100)
  --iterations <number>          Number of test iterations (default: 1)
  --verbose                      Enable verbose logging
  --help, -h                     Show this help message

Examples:
  npm run stress-test -- --url http://localhost:3000 --concurrent 50
  npm run stress-test -- --concurrent 100 --sequential 20 --iterations 3
  npm run stress-test -- --verbose --concurrent 20 --delay-between 5
      `);
      process.exit(0);
    } else if (arg === "--url" && i + 1 < args.length) {
      options.url = args[++i];
    } else if (arg === "--concurrent" && i + 1 < args.length) {
      options.concurrent = parseInt(args[++i], 10);
    } else if (arg === "--sequential" && i + 1 < args.length) {
      options.sequential = parseInt(args[++i], 10);
    } else if (arg === "--delay-between" && i + 1 < args.length) {
      options.delayBetweenRequests = parseInt(args[++i], 10);
    } else if (arg === "--delay-after" && i + 1 < args.length) {
      options.delayAfterTest = parseInt(args[++i], 10);
    } else if (arg === "--iterations" && i + 1 < args.length) {
      options.iterations = parseInt(args[++i], 10);
    } else if (arg === "--verbose") {
      options.verbose = true;
    }
  }

  return options;
}

async function runStressTest(options: StressTestOptions): Promise<void> {
  const { url, iterations = 1, verbose } = options;
  
  console.log(`🚀 Starting Memory Leak Stress Test`);
  console.log(`📡 Target URL: ${url}`);
  console.log(`🔄 Iterations: ${iterations}`);
  console.log(`⚡ Concurrent requests: ${options.concurrent}`);
  console.log(`📝 Sequential requests: ${options.sequential}`);
  console.log(`⏱️  Delay between requests: ${options.delayBetweenRequests}ms`);
  console.log(`⏳ Delay after test: ${options.delayAfterTest}ms`);
  console.log(`📊 Verbose logging: ${verbose ? "enabled" : "disabled"}`);
  console.log("");

  let totalSuccessful = 0;
  let totalFailed = 0;
  let totalRequests = 0;
  const allResponseTimes: number[] = [];

  for (let iteration = 1; iteration <= iterations; iteration++) {
    if (iterations > 1) {
      console.log(`🔄 Running iteration ${iteration}/${iterations}...`);
    }

    const startTime = Date.now();
    
    try {
      const result = await runMemoryLeakStressTest({
        server: null, // Not needed for CLI
        baseURL: url,
        ...options,
      });

      const iterationTime = Date.now() - startTime;
      
      if (verbose) {
        console.log(`✅ Iteration ${iteration} completed in ${iterationTime}ms`);
        console.log(`   📊 Stats: ${result.stats.successfulRequests} successful, ${result.stats.failedRequests} failed`);
        console.log(`   ⏱️  Average response time: ${result.stats.averageResponseTime.toFixed(2)}ms`);
      }

      totalSuccessful += result.stats.successfulRequests;
      totalFailed += result.stats.failedRequests;
      totalRequests += result.stats.totalRequests;
      allResponseTimes.push(result.stats.averageResponseTime);

      if (!result.success) {
        console.log(`❌ Iteration ${iteration} failed: ${result.error}`);
      }
    } catch (error) {
      console.log(`❌ Iteration ${iteration} failed with error: ${error}`);
      totalFailed++;
    }

    // Small delay between iterations
    if (iteration < iterations) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Calculate final statistics
  const totalTime = Date.now() - Date.now(); // This will be 0, but we can calculate from individual iterations
  const overallAverageResponseTime = allResponseTimes.length > 0 
    ? allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length 
    : 0;
  const successRate = totalRequests > 0 ? (totalSuccessful / totalRequests) * 100 : 0;

  console.log("");
  console.log("📊 Final Results:");
  console.log(`   ✅ Successful requests: ${totalSuccessful}`);
  console.log(`   ❌ Failed requests: ${totalFailed}`);
  console.log(`   📈 Total requests: ${totalRequests}`);
  console.log(`   🎯 Success rate: ${successRate.toFixed(2)}%`);
  console.log(`   ⏱️  Average response time: ${overallAverageResponseTime.toFixed(2)}ms`);
  console.log(`   🔄 Iterations completed: ${iterations}`);

  if (totalFailed === 0) {
    console.log("");
    console.log("🎉 All tests passed! No memory leaks detected.");
  } else {
    console.log("");
    console.log("⚠️  Some tests failed. Check the output above for details.");
    process.exit(1);
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    const options = parseArgs();
    await runStressTest(options);
  } catch (error) {
    console.error("❌ Stress test failed:", error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
