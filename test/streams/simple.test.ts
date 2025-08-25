import { describe, it, expect } from "vitest";
import { createRscStream } from "vite-plugin-react-server/stream";
import {
  createHandlerOptions,
  resolveOptions,
} from "vite-plugin-react-server/config";


resolveOptions({ moduleBase: "test/streams", Page: "test/streams/TestPage.tsx", verbose: false });

describe("Simple Stream Test", () => {
  it("should create RSC stream with correct properties", async () => {
    // Use createHandlerOptions to generate proper config
    // Pass configEnv to make worker behave like development mode (load from source files)
    // Both environments should load and stream the actual page component
    const config = await createHandlerOptions("/", {
      configEnv: { command: "serve", mode: "development" }
    });
    // console.log({ config: Object.keys(config) });
    
    const rscStream = createRscStream(config);

    expect(rscStream).toBeDefined();
    expect(typeof rscStream).toBe("object");

    console.log("✅ RSC stream created!");
    console.log("Properties:", Object.keys(rscStream));

    // Check what properties actually exist
    if (rscStream?.rscStream) {
      console.log("✅ Found .rscStream property (the actual stream)");
      expect(rscStream.rscStream).toBeDefined();
    }

    if (rscStream?.pipe) {
      console.log("✅ Found .pipe() method");
      expect(typeof rscStream.pipe).toBe("function");
    }

    if (rscStream?.abort) {
      console.log("✅ Found .abort() method");
      expect(typeof rscStream.abort).toBe("function");
    }

    // 🚀 NOW LET'S ACTUALLY START THE STREAM!
    console.log("🚀 Starting to read from RSC stream...");
    
    let chunks: any[] = [];
    let isStreamEnded = false;
    
    // Create a promise that resolves when stream ends
    const streamPromise = new Promise((resolve, reject) => {
      rscStream.rscStream.on('data', (chunk) => {
        console.log("📦 Received chunk:", chunk.toString());
        chunks.push(chunk);
      });
      
      rscStream.rscStream.on('end', () => {
        console.log("🏁 Stream ended!");
        isStreamEnded = true;
        resolve(chunks);
      });
      
      rscStream.rscStream.on('error', (error) => {
        console.log("❌ Stream error:", error.message);
        reject(error);
      });
    });

    // Wait for stream to complete (with timeout)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Stream timeout after 5s")), 5000);
    });

    try {
      await Promise.race([streamPromise, timeoutPromise]);
      expect(chunks.length).toBeGreaterThan(0);
      console.log(`✅ Stream completed! Received ${chunks.length} chunks`);
      console.log("📊 Total data length:", chunks.reduce((total, chunk) => total + chunk.length, 0));
    } catch (error) {
      console.log("⚠️ Stream issue:", error?.message);
      expect(error).toBe(null);
    }
  });
});
