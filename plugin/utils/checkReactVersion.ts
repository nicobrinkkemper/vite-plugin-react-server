let checked = false;

/**
 * Verify React experimental is available. The vendored react-server-dom-esm
 * transport requires Taint APIs that only exist in React experimental builds.
 * Stable React 19.x causes: "Cannot read properties of undefined (reading 'add')"
 */
export function checkReactExperimental() {
  if (checked) return;
  checked = true;
  
  try {
    // Use require for sync access — React is always available at this point
    const version: string = globalThis.process?.versions
      ? require("react").version
      : "";
    
    if (version && !version.includes("experimental")) {
      throw new Error(
        `[vite-plugin-react-server] React ${version} is not supported. ` +
        `This plugin requires React experimental builds. ` +
        `Install with: npm install react@experimental react-dom@experimental`
      );
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("not supported")) throw e;
  }
}
