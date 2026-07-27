// React types are imported from vendor system at runtime
import { PANIC_SYMBOL } from "./shouldPanic.js";

type ErrorInfo = {
  componentStack?: string;
};

export function toError(error: unknown, errorInfo?: ErrorInfo): Error {
  if (typeof error === "string") {
    const err = new Error(error, { cause: errorInfo });
    return err;
  }
  if (error == null ) {
    const err = new Error("Unknown React Stream Error (null/undefined)", { cause: errorInfo });
    // Error.captureStackTrace(err, toError);
    return err;
  }
  if (error instanceof Error) {
    return error;
  }
  if(typeof error === "object" && error !== null && Object.keys(error).length === 0) {
    const err = new Error("Unknown React Stream Error (empty object)", { cause: error });
    // Error.captureStackTrace(err, toError);
    return err;
  }
  if (typeof error === "object" && error != null) {
    // Handle serialized error objects from worker threads
    if ("message" in error && "name" in error && typeof error.message === "string" && typeof error.name === "string") {
      const err = new Error(error.message, { cause: errorInfo });
      err.name = error.name;
      if ("stack" in error && typeof error.stack === "string") {
        err.stack = error.stack;
      } else {
        // If no stack trace available, capture one at this point
        // Error.captureStackTrace(err, toError);
      }
      // Rehydrate the panic classification: serializeError carries it as the
      // plain `isPanic` field because the Symbol key does not survive
      // postMessage's structured clone. Panic decided in the worker stays
      // panic on the main thread instead of being re-derived from
      // panicThreshold downstream.
      if ((error as { isPanic?: boolean }).isPanic === true) {
        (err as unknown as Record<symbol, boolean>)[PANIC_SYMBOL] = true;
      }
      return err;
    }
    
    // Try to extract meaningful information from other error objects
    let message = "Unknown React Stream Error";
    
    if ("message" in error) {
      if (typeof error.message === "string") {
        message = error.message;
      } else if (error.message !== null && error.message !== undefined) {
        // The message property exists but is not a string - this might be the issue
        try {
          message = `Message object: ${JSON.stringify(error.message)}`;
        } catch {
          message = `Message object: [object could not be stringified]`;
        }
      }
    } else if ("reason" in error && typeof error.reason === "string") {
      message = error.reason;
    } else if ("error" in error && error.error !== null && error.error !== undefined && typeof error.error === "string") {
      message = error.error;
    } else if ("error" in error && error.error !== null && error.error !== undefined) {
      // Improve handling when nested error is an Error instance
      const nested: any = (error as any).error;
      if (nested instanceof Error) {
        const err = new Error(nested.message, { cause: nested });
        err.name = nested.name || err.name;
        if (typeof nested.stack === "string") err.stack = nested.stack;
        return err;
      }
      // Fallback when nested error is a non-Error object
      try {
        message = `Error object: ${JSON.stringify(nested)}`;
      } catch {
        message = `Error object: [object could not be stringified]`;
      }
    } else if ('reason' in error && error.reason instanceof Error) {
      message = error.reason.message;
    } else if ('reason' in error && error.reason instanceof Object && 'error' in error.reason) {
      // Handle React Server Components error format: { reason: { error: Error | null } }
      if (error.reason.error instanceof Error) {
        message = error.reason.error.message;
      } else if (error.reason.error !== null && error.reason.error !== undefined) {
        // Handle case where error.reason.error exists but is not an Error object
        try {
          message = `React error object: ${JSON.stringify(error.reason.error)}`;
        } catch {
          message = `React error object: [object could not be stringified]`;
        }
      } else {
        // Handle case where error.reason.error is null/undefined
        message = "React Server Components error (null/undefined error)";
      }
    } else {
      // Try to stringify the object to get more information
      try {
        const stringified = JSON.stringify(error, null, 2);
        message = stringified
      } catch {
        // If JSON.stringify fails, fallback to a generic message
        message = `Object error: [object could not be stringified]`;
      }
    }
    
    // check for stack
    if (typeof error === "object" && error != null && "stack" in error && typeof error.stack === "string") {
      const err = new Error(message, { cause: error });
      err.stack = error.stack;
      return err;
    }
    
    const err = new Error(message ?? "Unknown React Stream Error", { cause: errorInfo });
    // Error.captureStackTrace(err, toError);
    return err;
  }
  
  // Handle primitive types
  try {
    const err = new Error(`Unknown React Stream Error: ${String(error)}`, { cause: errorInfo });
    // Error.captureStackTrace(err, toError);
    return err;
  } catch {
    const err = new Error("Unknown React Stream Error (unstringifiable)");
    // Error.captureStackTrace(err, toError);
    return err;
  }
}
