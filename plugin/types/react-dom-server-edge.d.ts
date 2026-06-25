// @types/react-dom ships types for "react-dom/server" (including
// renderToReadableStream) but not for the "react-dom/server.edge" entry, which
// exposes the same Web-streams surface. Re-export the server types so
// vendor.client.ts's ReactDOMHtmlServerEdge is typed.
declare module "react-dom/server.edge" {
  export * from "react-dom/server";
}
