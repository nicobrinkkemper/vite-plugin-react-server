import { messageHandler } from "./messageHandler.js";
import { parentPort } from "node:worker_threads";
import { Window } from 'happy-dom';
const window = new Window({ url: 'https://localhost:8080' });
const document = window.document;
globalThis.window = window as any;
globalThis.document = document as any;

let ready = false;
if (!parentPort) throw new Error("This module must be run as a worker");

// Signal ready with environment
parentPort?.on("message", messageHandler);
parentPort?.postMessage({ 
    type: "READY", 
    env: process.env["NODE_ENV"],
    pid: process.pid 
});
