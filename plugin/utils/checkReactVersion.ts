let checked = false;

/**
 * Verify the installed React can drive React Server Components.
 *
 * As of 2.0 the plugin runs on **stable** React 19.2+ (the line where the
 * RSC server APIs — `prerenderToNodeStream`, the `react-server` exports the
 * transport binds to — graduated out of experimental). The vendored
 * `react-server-dom-esm` transport ships inside `react-server-loader`, whose
 * peer range pins the exact React it was built against; this runtime check is
 * a clearer error than the internals mismatch you'd otherwise hit at render
 * time if a too-old React slipped past the peer.
 */
export function checkReactVersion() {
  if (checked) return;
  checked = true;

  try {
    // Use require for sync access — React is always available at this point
    const version: string = globalThis.process?.versions
      ? require("react").version
      : "";

    if (!version) return;

    // Experimental builds (0.0.0-experimental-…) still work — they sort below
    // 19 but carry the RSC APIs — so only reject clearly-too-old stable Reacts.
    const stable = version.match(/^(\d+)\.(\d+)\./);
    if (stable) {
      const [, major, minor] = stable.map(Number) as [string, number, number];
      const tooOld = major < 19 || (major === 19 && minor < 2);
      if (tooOld) {
        throw new Error(
          `[vite-plugin-react-server] React ${version} is not supported. ` +
            `This plugin requires React 19.2 or newer (or an experimental build). ` +
            `Install with: npm install react@^19.2.7 react-dom@^19.2.7`
        );
      }
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("not supported")) throw e;
  }
}
