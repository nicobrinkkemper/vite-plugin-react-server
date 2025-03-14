import { PassThrough } from "node:stream";
import { parentPort } from "node:worker_threads";
import type { HtmlRenderState, HtmlWorkerMessage } from "../types.js";
import * as ReactDOMServer from "react-dom/server";
import React from "react";
import {
  createFromNodeStream,
  // @ts-ignore
} from "react-server-dom-esm/client.node";

// Track active renders and streams
const activeRenders = new Map<string, HtmlRenderState>();
const htmlContent = new Map<string, string>();
const htmlPromises = new Map<string, Promise<string>>();
export const messageHandler = async (message: HtmlWorkerMessage) => {
  try {
    switch (message.type) {
      case "RSC_CHUNK": {
        const { id, chunk, moduleRootPath, moduleBaseURL, htmlOutputPath, pipableStreamOptions, clientManifest, serverManifest } = message;
        
        let render = activeRenders.get(id);
        if (!render) {
          render = {
            chunks: [],
            id,
            complete: false,
            rendered: false,
            moduleRootPath,
            moduleBaseURL,
            outDir: '',
            htmlOutputPath: htmlOutputPath,
            pipableStreamOptions: pipableStreamOptions,
            clientManifest,
            serverManifest,
          };
          activeRenders.set(id, render);
        }

        // The chunk is a Blob, convert it to a Buffer
        const buffer = Buffer.from(await chunk.arrayBuffer());
        
        try {
          // Process chunk with backpressure handling
          const processChunk = async () => {
            // If chunk is too large (> 1MB), split it into smaller pieces
            if (buffer.length > 1024 * 1024) {
              const chunkSize = 1024 * 1024; // 1MB chunks
              for (let i = 0; i < buffer.length; i += chunkSize) {
                const subChunk = buffer.slice(i, i + chunkSize);
                render.chunks.push(subChunk.toString());
                
                // Signal back to main thread that sub-chunk was processed
                parentPort?.postMessage({
                  type: "CHUNK_PROCESSED",
                  id,
                  success: true
                });
              }
            } else {
              render.chunks.push(buffer.toString());
              
              // Signal back to main thread that chunk was processed
              parentPort?.postMessage({
                type: "CHUNK_PROCESSED",
                id,
                success: true
              });
            }
          };

          // Process chunk and handle any errors
          await processChunk();
        } catch (error) {
          console.error(`Error processing chunk for ${id}:`, error);
          parentPort?.postMessage({
            type: "CHUNK_ERROR",
            id,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        break;
      }

      case "RSC_END": {
        const { id } = message;
        const render = activeRenders.get(id);
        if (!render) {
          throw new Error(`No render state found for ${id}`);
        }

        // Mark this render as complete
        render.complete = true;

        try {
          // Create a PassThrough stream with error handling
          const rscStream = new PassThrough({
            highWaterMark: 1024 * 1024, // 1MB buffer
            autoDestroy: true
          });

          // Process chunks with proper error handling and backpressure
          await new Promise<void>((resolve, reject) => {
            let writeIndex = 0;
            let hasError = false;

            const writeNextChunk = () => {
              if (hasError) return;
              
              if (writeIndex >= render.chunks.length) {
                rscStream.end();
                resolve();
                return;
              }

              const chunk = render.chunks[writeIndex];
              
              try {
                const canContinue = rscStream.write(chunk);
                writeIndex++;

                if (canContinue) {
                  writeNextChunk();
                } else {
                  // Wait for drain event before writing more
                  rscStream.once('drain', writeNextChunk);
                }
              } catch (error) {
                hasError = true;
                reject(error);
              }
            };

            // Handle stream errors
            rscStream.on('error', (error) => {
              hasError = true;
              reject(error);
            });

            // Start writing chunks
            writeNextChunk();
          });
            
          // Create React elements from stream with timeout
          const reactElements = await Promise.race([
            createFromNodeStream(
              rscStream,
              render.moduleRootPath,
              render.moduleBaseURL
            ),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('RSC stream processing timeout')), 30000)
            )
          ]);

          // Create a promise that resolves when HTML is complete
          const htmlPromise = new Promise<string>((resolve, reject) => {
            const collectStream = new PassThrough({
              autoDestroy: true
            });
            let html = '';

            collectStream.on("data", (chunk) => {
              html += chunk.toString();
            });

            collectStream.on("error", (error) => {
              reject(error);
            });

            collectStream.on("end", () => {
              resolve(html);
              render.rendered = true;
              parentPort?.postMessage({
                type: "ALL_READY",
                id,
                html,
                outputPath: render.htmlOutputPath,
              });
            });

            // Render to pipeable stream with error handling
            const stream = ReactDOMServer.renderToPipeableStream(
              reactElements as React.ReactNode,
              {
                ...render.pipableStreamOptions,
                // Calculate relative paths based on route depth
                bootstrapModules: render.pipableStreamOptions?.bootstrapModules?.map(path => {
                  if (!path) return path;
                  if(render.moduleBaseURL && render.moduleBaseURL !== '') {
                    return new URL(path, render.moduleBaseURL).toString();
                  }
                  const depth = id.split('/').filter(Boolean).length;
                  const prefix = depth > 0 ? '../'.repeat(depth) : '/';
                  return path.startsWith('/') ? prefix + path.slice(1) : prefix + path;
                }),
                // CSS is handled by CssCollector component through the RSC stream
                bootstrapScripts: render.pipableStreamOptions?.bootstrapScripts || [],
                onShellReady() {
                  parentPort?.postMessage({ type: "SHELL_READY", id });
                },
                onError(error) {
                  reject(error);
                }
              }
            );

            // Pipe to collection stream with error handling
            stream.pipe(collectStream).on('error', (error) => {
              reject(error);
            });
          });

          // Wait for HTML to be complete
          await htmlPromise;

          // Clean up resources
          rscStream.destroy();
          activeRenders.delete(id);
          htmlContent.delete(id);
          htmlPromises.delete(id);
        } catch (error) {
          console.error(`Error processing RSC stream for ${id}:`, error);
          // Clean up resources on error
          activeRenders.delete(id);
          htmlContent.delete(id);
          htmlPromises.delete(id);
          
          // Send error message to parent
          parentPort?.postMessage({
            type: "ERROR",
            id,
            error: error instanceof Error ? error.message : String(error)
          });
          
          // Re-throw to ensure the error is propagated
          throw error;
        }
        break;
      }

      case "SHUTDOWN": {
        console.log('Received shutdown signal');
        // Clean up all resources before shutting down
        for (const [id] of activeRenders) {
          console.log(`Cleaning up render state for ${id}`);
          activeRenders.delete(id);
          htmlContent.delete(id);
          htmlPromises.delete(id);
        }
        parentPort?.close();
        process.exit(0);
        break;
      }
    }
  } catch (error) {
    console.error('Error in messageHandler:', error);
    throw error;
  }
};
