import { parentPort } from "node:worker_threads";

// Get environment variables from process.env
const env = {
  DEV: process.env["VITE_DEV"] === "1",
  PROD: process.env["VITE_PROD"] === "1",
  MODE: process.env["VITE_MODE"],
  SSR: process.env["VITE_SSR"] === "true",
  BASE_URL: process.env["VITE_BASE_URL"],
  PUBLIC_ORIGIN: process.env["VITE_PUBLIC_ORIGIN"],
};

// Create a module that exports import.meta.env
const envModule = `
Object.defineProperty(import.meta, 'env', {
  value: ${JSON.stringify(env)},
  writable: false,
  enumerable: true,
  configurable: false
});
`;

// Register the loader
if (parentPort) {
  parentPort.on("message", (message) => {
    if (message.type === "LOAD") {
      parentPort?.postMessage({
        type: "LOADED",
        id: message.id,
        code: envModule,
      });
    }
  });
} 