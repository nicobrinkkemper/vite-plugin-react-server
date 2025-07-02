/**
 * Enhances an existing error with additional context and captured stack trace
 * This is useful when we need to wrap errors with more context while preserving
 * the original error information
 */
export function enhanceError(
  originalError: unknown,
  context: string,
  captureStackTraceFunction?: Function
): Error {
  const baseMessage = originalError instanceof Error 
    ? originalError.message 
    : String(originalError);
  
  const enhancedMessage = `[${context}] ${baseMessage}`;
  
  // Create a new error with enhanced message
  const enhancedError = new Error(enhancedMessage);
  
  // Preserve original error properties if available
  if (originalError instanceof Error) {
    enhancedError.name = originalError.name;
    enhancedError.cause = originalError;
    
    // Preserve original stack if available, but append our captured stack
    if (originalError.stack) {
      enhancedError.stack = originalError.stack;
    }
  } else {
    enhancedError.name = "EnhancedError";
    enhancedError.cause = originalError;
  }
  
  // Capture stack trace at the point where this function was called
  // This will give us context about where the error enhancement happened
  Error.captureStackTrace(enhancedError, captureStackTraceFunction || enhanceError);
  
  return enhancedError;
}

/**
 * Creates a new error with context and captured stack trace
 * Useful for creating contextual errors at specific points in the code
 */
export function createContextualError(
  message: string,
  context: string,
  captureStackTraceFunction?: Function
): Error {
  const contextualMessage = `${context}: ${message}`;
  const error = new Error(contextualMessage);
  error.name = "ContextualError";
  
  // Capture stack trace excluding this function (or the specified function)
  Error.captureStackTrace(error, captureStackTraceFunction || createContextualError);
  
  return error;
} 