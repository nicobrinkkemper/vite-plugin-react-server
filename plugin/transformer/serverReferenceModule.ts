// `default` is a reserved word, so a default-exported server function cannot
// be declared as `export const default`. Its reference id stays `#default`.
const exportStatement = (exportName: string, value: string): string =>
  exportName === "default"
    ? `export default ${value};`
    : `export const ${exportName} = ${value};`;

/**
 * The browser module that stands in for a "use server" module: one
 * `createServerReference` proxy per export, addressed as `<hostedId>#<export>`.
 *
 * The esm createServerReference is transport-safe: its callable only delegates
 * to callServer(id, args), and every flavor-sensitive step (encodeReply,
 * response decode) lives in createCallServer's transport chooser. Emitting the
 * webpack client instead would read module-loading globals at eval time.
 */
export const serverReferenceProxyModule = (
  hostedId: string,
  exportNames: readonly string[],
  viteBase: string
): string =>
  [
    `import { createServerReference } from "react-server-dom-esm/client.browser";`,
    `import { createCallServer } from "vite-plugin-react-server/utils";`,
    `const callServer = createCallServer(${JSON.stringify(viteBase)});`,
    ...exportNames.map((n) =>
      exportStatement(
        n,
        `createServerReference(${JSON.stringify(`${hostedId}#${n}`)}, callServer)`
      )
    ),
  ].join("\n");

/**
 * The SSR module that stands in for a "use server" module: render-safe stubs
 * (a server function is never called during render, and the browser transport
 * cannot initialise under Node).
 */
export const serverReferenceSsrStubModule = (
  exportNames: readonly string[]
): string =>
  exportNames
    .map((n) =>
      exportStatement(
        n,
        `() => { throw new Error(${JSON.stringify(
          `Server function "${n}" cannot run during SSR; it executes in the browser via a server reference.`
        )}); }`
      )
    )
    .join("\n");
