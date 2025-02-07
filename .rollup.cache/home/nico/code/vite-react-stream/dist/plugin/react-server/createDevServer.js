import { createDevMiddleware } from "./createDevMiddleware.js";
export function createDevServer(server, options) {
    server.middlewares.use(createDevMiddleware(server, options));
}
//# sourceMappingURL=createDevServer.js.map