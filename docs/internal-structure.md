## Internal Structure

The plugin is organized into a few layers to keep behavior consistent across client and server conditions.

### Core Layers

- `plugin/config`: option resolution, env/origin derivation, and defaults.
- `plugin/helpers`: shared request/stream utilities used in both client and server paths.
- `plugin/react-client`: dev server behavior when running without `react-server`.
- `plugin/react-server`: dev server behavior when running with `react-server`.
- `plugin/worker`: worker runtimes and message contracts.

### Consolidated Helpers

These helpers are designed to keep parity between the worker and main-thread paths:

- `createRequestHandler`: shared request classification pipeline.
- `createHandlerOptions`: consistent dev handler options derived from server config.
- `pipeRscStreamToResponse`: shared stream piping and timeout handling.
- `responseHeaders`: shared RSC response headers.
- `serverRestartHandler`: shared restart handling.
- `handleServerAction`: shared server-action parsing and response shape.
- `executeServerAction`: shared server-action loading and execution.

If you add new behavior, prefer placing it in `helpers` and reusing it from both
`react-client` and `react-server` to keep behavior aligned.
