// The vendored webpack transport entries in react-server-loader are plain JS
// (React's built output) with no declarations. Typed loosely here — the
// integration points cast to the shapes they use, mirroring the existing
// react-server-dom-esm ambient declarations.
declare module "react-server-loader/webpack/client.edge" {
  export function createFromReadableStream(
    stream: ReadableStream<Uint8Array>,
    options: { serverConsumerManifest: unknown }
  ): Promise<unknown>;
}
