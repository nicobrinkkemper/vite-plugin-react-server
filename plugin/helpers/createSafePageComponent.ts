import { React } from "../vendor/vendor.server.js";

/**
 * Creates a safe Page component that doesn't throw errors.
 * Used when headless streams have errors to prevent errors from reaching the HTML worker.
 * 
 * @param errorMessage - Optional error message to display
 * @returns A safe React component that renders a div with error content
 */
export function createSafePageComponent(errorMessage: string = "Error occurred during rendering") {
  return () => React.createElement("div", { id: "root" }, errorMessage);
}

/**
 * Creates a fallback Page component using React.Fragment.
 * Used by RSC worker for consistent fallback behavior.
 * 
 * @returns React.Fragment as a safe fallback
 */
export function createFallbackPageComponent() {
  return React.Fragment;
}

/**
 * Determines if a Page component should be replaced with a safe fallback.
 * 
 * @param hasHeadlessError - Whether the headless stream had errors
 * @param isHeadless - Whether this is a headless stream
 * @returns true if a safe fallback should be used
 */
export function shouldUseSafePageComponent(
  hasHeadlessError: boolean,
  isHeadless: boolean
): boolean {
  // For headless streams, never use fallback (let them error naturally)
  if (isHeadless) {
    return false;
  }
  
  // For full streams, use fallback if headless stream had errors
  return hasHeadlessError;
}

/**
 * Creates the appropriate Page component based on error state.
 * 
 * @param originalPageComponent - The original Page component
 * @param hasHeadlessError - Whether the headless stream had errors
 * @param isHeadless - Whether this is a headless stream
 * @param useReactFragment - Whether to use React.Fragment (RSC worker style) or div (server style)
 * @returns The appropriate Page component to use
 */
export function createPageComponentWithErrorHandling(
  originalPageComponent: any,
  hasHeadlessError: boolean,
  isHeadless: boolean,
  useReactFragment: boolean = false
) {
  if (shouldUseSafePageComponent(hasHeadlessError, isHeadless)) {
    return useReactFragment ? createFallbackPageComponent() : createSafePageComponent();
  }
  
  return originalPageComponent;
}
