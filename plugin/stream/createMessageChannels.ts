import { MessageChannel } from "node:worker_threads";
import { setMaxListenersOnPort } from "./setMaxListeners.js";

/**
 * Creates a pair of MessageChannels for two-port communication pattern.
 * 
 * This is the standard pattern used throughout the codebase for worker communication:
 * - Data channel: For streaming actual data (RSC chunks, HTML content, etc.)
 * - Control channel: For control messages (completion signals, errors, metrics, etc.)
 * 
 * @returns Object containing both channels with consistent naming
 */
export function createMessageChannels() {
  const dataChannel = new MessageChannel();
  const controlChannel = new MessageChannel();
  
  // Increase max listeners to prevent warnings during development
  // These channels are created per-request, so 20 should be sufficient for most cases
  // Using 20 instead of 15 to account for potential extra listeners during cleanup
  setMaxListenersOnPort(dataChannel.port1, 20);
  setMaxListenersOnPort(dataChannel.port2, 20);
  setMaxListenersOnPort(controlChannel.port1, 20);
  setMaxListenersOnPort(controlChannel.port2, 20);
  
  return {
    dataChannel,
    controlChannel,
    // Convenience destructuring for common usage pattern
    dataPort1: dataChannel.port1,
    dataPort2: dataChannel.port2,
    controlPort1: controlChannel.port1,
    controlPort2: controlChannel.port2,
  };
}

/**
 * Creates transfer list for MessagePort communication.
 * 
 * Used when sending ports through postMessage with transferable objects.
 * 
 * @param port1 - First port to transfer
 * @param port2 - Second port to transfer  
 * @returns Array suitable for transferList parameter
 */
export function createTransferList(port1: any, port2: any) {
  return [port1, port2] as any; // Type assertion needed due to transferable object complexity
}
