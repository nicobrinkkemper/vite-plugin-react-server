export function toError(error: unknown): Error {
  if (typeof error === "string") {
    const err = new Error(error);
    // Capture stack trace, excluding this function from the trace
    Error.captureStackTrace(err, toError);
    return err;
  }
  if (error == null) {
    const err = new Error("Unknown React Stream Error (null/undefined)");
    Error.captureStackTrace(err, toError);
    return err;
  }
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    // Handle serialized error objects from worker threads
    if ("message" in error && "name" in error && typeof error.message === "string" && typeof error.name === "string") {
      const err = new Error(error.message);
      err.name = error.name;
      if ("stack" in error && typeof error.stack === "string") {
        err.stack = error.stack;
      } else {
        // If no stack trace available, capture one at this point
        Error.captureStackTrace(err, toError);
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
    } else if ("error" in error && typeof error.error === "string") {
      message = error.error;
    } else {
      // Try to stringify the object to get more information
      try {
        const stringified = JSON.stringify(error, null, 2);
        message = `Object error: ${stringified}`;
      } catch {
        // If JSON.stringify fails, fallback to a generic message
        message = `Object error: [object could not be stringified]`;
      }
    }
    
    // check for stack
    if ("stack" in error && typeof error.stack === "string") {
      const err = new Error(message);
      err.stack = error.stack;
      return err;
    }
    
    const err = new Error(message);
    Error.captureStackTrace(err, toError);
    return err;
  }
  
  // Handle primitive types
  try {
    const err = new Error(`Unknown React Stream Error: ${String(error)}`);
    Error.captureStackTrace(err, toError);
    return err;
  } catch {
    const err = new Error("Unknown React Stream Error (unstringifiable)");
    Error.captureStackTrace(err, toError);
    return err;
  }
}
