// Back-compat shim: vprs's `./directives` subpath used to expose the
// directive engine implementation directly. The implementation moved to
// react-server-loader; this file re-exports everything so existing
// consumers (and vprs's own tests) keep working without code changes.
export * from "react-server-loader/directives";
