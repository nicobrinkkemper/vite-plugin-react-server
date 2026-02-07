/**
 * Creates a new error with context from any input.
 * Always creates a fresh stack trace and sets the original as the cause.
 * This is the preferred way to wrap errors with context.
 */
export function enhanceError(
  originalError: Error | string | {message: string},
  captureStackTraceFunction: Function,
  context: string = captureStackTraceFunction.name,
): Error {
  const baseMessage = typeof originalError === 'string' ? originalError : originalError.message;
  
  const contextualError = createContextualError(baseMessage, context, captureStackTraceFunction || enhanceError);
  
  // Set the original as the cause for traceability
  contextualError.cause = originalError;
  
  return contextualError;
}

/**
 * Creates a new error with context and captured stack trace
 * Useful for creating contextual errors at specific points in the code
 */
export function createContextualError(
  message: string,
  context: string = '',
  captureStackTraceFunction?: Function
): Error {
  const contextualMessage = context && context !== '' ? `[${context}:error] ${message}` : message;
  const error = new Error(contextualMessage);
  error.name = "ContextualError";

  // Capture stack trace excluding this function (or the specified function)
  Error.captureStackTrace(
    error,
    captureStackTraceFunction || createContextualError
  );

  return error;
}
