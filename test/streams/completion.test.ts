import { describe, expect, it } from "vitest";
import { createRscStream } from "vite-plugin-react-server/stream";
import {
  createHandlerOptions,
  resolveOptions,
} from "vite-plugin-react-server/config";

// Call resolveOptions outside the test (following the pattern from simple.test.ts)
resolveOptions({ 
  moduleBase: "test/streams", 
  Page: "test/streams/TestPage.tsx", 
  verbose: true,
});

describe("RSC Stream Completion Detection", () => {
  it("should properly detect stream completion via stream events", async () => {
    console.log("🚀 Testing proper stream completion detection...");
    
    // Create RSC stream
    const config = await createHandlerOptions("/stream-completion", {
      configEnv: { command: "serve", mode: "development" }
    });

    const rscResult = createRscStream(config);
    console.log("✅ RSC stream created");

    // Monitor all stream events
    let dataReceived = false;
    let endEventFired = false;
    let closeEventFired = false;
    let errorOccurred = false;
    
    const chunks: Buffer[] = [];

    rscResult.rscStream.on('data', (chunk: Buffer) => {
      dataReceived = true;
      chunks.push(chunk);
      console.log(`📦 Data chunk received: ${chunk.length} bytes`);
    });

    rscResult.rscStream.on('end', () => {
      endEventFired = true;
      console.log(`🏁 Stream 'end' event fired`);
    });

    rscResult.rscStream.on('close', () => {
      closeEventFired = true;
      console.log(`🔒 Stream 'close' event fired`);
    });

    rscResult.rscStream.on('error', (error) => {
      errorOccurred = true;
      console.error(`❌ Stream error:`, error);
    });

    // Wait for stream completion
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Stream completion timeout. Data: ${dataReceived}, End: ${endEventFired}, Close: ${closeEventFired}, Error: ${errorOccurred}`));
      }, 10000);

      rscResult.rscStream.on('end', () => {
        clearTimeout(timeout);
        resolve();
      });

      rscResult.rscStream.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Verify proper completion
    expect(dataReceived).toBe(true);
    expect(endEventFired).toBe(true);
    expect(errorOccurred).toBe(false);
    expect(chunks.length).toBeGreaterThan(0);
    
    const totalData = Buffer.concat(chunks);
    expect(totalData.length).toBeGreaterThan(0);
    
    console.log(`✅ Stream completed successfully with ${totalData.length} bytes`);
    console.log(`🎯 First 100 chars: ${totalData.toString().substring(0, 100)}...`);
  }, 15000);

  it("should test Web Stream conversion with proper completion", async () => {
    console.log("🔄 Testing Web Stream conversion...");
    
    const config = await createHandlerOptions("/web-stream", {
      configEnv: { command: "serve", mode: "development" }
    });

    const rscResult = createRscStream(config);

    // Test .toWeb() if available (Node.js v16.5.0+)
    if (typeof (rscResult.rscStream as any).toWeb === 'function') {
      console.log("🔄 Converting to Web Stream using .toWeb()");
      
      const webStream = (rscResult.rscStream as any).toWeb();
      const reader = webStream.getReader();
      
      let totalBytes = 0;
      let chunks = 0;
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          chunks++;
          totalBytes += value.length;
          console.log(`📦 Web Stream chunk ${chunks}: ${value.length} bytes`);
        }
        
        console.log(`✅ Web Stream completed: ${chunks} chunks, ${totalBytes} total bytes`);
        expect(totalBytes).toBeGreaterThan(0);
        expect(chunks).toBeGreaterThan(0);
        
      } finally {
        reader.releaseLock();
      }
    } else {
      console.log("⚠️ .toWeb() not available, skipping Web Stream test");
      // Just consume the regular stream
      rscResult.rscStream.resume();
      await new Promise<void>((resolve, reject) => {
        rscResult.rscStream.on('end', resolve);
        rscResult.rscStream.on('error', reject);
      });
    }
    
    console.log("🎉 Web Stream test completed!");
  }, 15000);
});
