import { describe, it, expect } from "vitest";
import { createHandlerOptions, type CreateHandlerOptions } from "vite-plugin-react-server/config";
import { createHtmlStream, createRscStream } from "vite-plugin-react-server/stream";
import { resolveOptions } from "vite-plugin-react-server/config";
import { Writable } from "node:stream";
import { getCondition } from "vite-plugin-react-server/config";

// Configure the plugin for our test
// Enable HTML worker for HTML streaming tests
resolveOptions({ 
  moduleBase: "test/streams", 
  Page: "test/streams/TestPage.tsx", 
  verbose: false,
  dev: {
    // we need this flag, since normally we don't need a html worker in dev mode
    // since its all handled in the browser
    useHtmlWorker: getCondition() === "react-server"
  }
});

describe("HTML Stream Test", () => {
  it("should create HTML stream with correct properties and output", async () => {
    // Use createHandlerOptions to generate proper config
    // Pass configEnv to make worker behave like development mode (load from source files)
    // HTML worker is enabled globally via resolveOptions
    // Both environments should load and stream the actual page component as HTML
    const config = await createHandlerOptions("/", {
      configEnv: { command: "serve", mode: "development" }
    });
    console.log("Available workers:", {
      hasWorker: !!config.worker,
      hasRscWorker: !!config.rscWorker,
      hasHtmlWorker: !!config.htmlWorker,
      workerType: config.worker === config.rscWorker ? 'RSC' : 
                  config.worker === config.htmlWorker ? 'HTML' : 'Unknown'
    });
    
    // First create an RSC stream (React Server Components)
    console.log("🔧 Creating RSC stream...");
    const rscStreamResult = createRscStream(config);
    console.log("✅ RSC stream created:", !!rscStreamResult.rscStream);

    // Then create HTML stream with the RSC stream directly (not as children)
    console.log("🔧 Creating HTML stream with RSC stream...");
    const htmlStream = createHtmlStream({
      ...config,
      rscStream: rscStreamResult.rscStream,
    });

    expect(htmlStream).toBeDefined();
    expect(typeof htmlStream).toBe("object");

    console.log("✅ HTML stream created!");
    console.log("Properties:", Object.keys(htmlStream));

    // Check for expected stream API properties
    expect(htmlStream).toHaveProperty("pipe");
    expect(htmlStream).toHaveProperty("abort");

    console.log("✅ Found .pipe() method");
    console.log("✅ Found .abort() method");

    // Test HTML streaming by creating a writable stream to capture the output
    console.log("🚀 Starting to read from HTML stream...");

    const chunks: string[] = [];
    let totalLength = 0;

    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Stream timed out after 10 seconds"));
      }, 10000);

      const writable = new Writable({
        write(chunk: Buffer | string, _encoding, callback) {
          const chunkStr = chunk.toString();
          chunks.push(chunkStr);
          totalLength += chunkStr.length;
          console.log(`📦 Received HTML chunk: ${chunkStr.length} bytes`);
          console.log(`Content preview: ${chunkStr.substring(0, 200)}...`);
          callback();
        }
      });

      writable.on("finish", () => {
        clearTimeout(timeout);
        console.log("🏁 HTML stream ended!");
        resolve();
      });

      writable.on("error", (error: Error) => {
        clearTimeout(timeout);
        console.error("❌ HTML stream error:", error);
        reject(error);
      });

      // Pipe the HTML stream to our writable
      htmlStream.pipe(writable);
    });

    console.log(`✅ HTML stream completed! Received ${chunks.length} chunks`);
    console.log(`📊 Total HTML length: ${totalLength}`);

    // Verify we actually got HTML content
    const fullHtml = chunks.join("");
    expect(fullHtml).toContain("<!DOCTYPE html>");
    expect(fullHtml).toContain("<html");
    expect(fullHtml).toContain("</html>");
    
    // Should contain our test page content
    expect(fullHtml).toContain("Simple Test Page");
    expect(fullHtml).toContain("Hello from the test page component!");

    console.log("✅ HTML content validation passed!");
    console.log("📝 Full HTML preview (first 500 chars):");
    console.log(fullHtml.substring(0, 500));
  });
});
