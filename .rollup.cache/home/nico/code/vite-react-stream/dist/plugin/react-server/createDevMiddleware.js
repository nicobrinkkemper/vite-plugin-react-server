import { IncomingMessage, ServerResponse } from "http";
import {} from "../types.js";
import { createHandler } from "./createHandler.js";
/**
 * Creates a request handler for development
 */
export function createDevMiddleware(server, options) {
    return async (req, res, next) => {
        // Skip non-page requests
        if (!req.url ||
            (req.url.includes(".") && !req.url.endsWith("/index.rsc"))) {
            return next();
        }
        const url = req.url.endsWith("/index.rsc")
            ? req.url.replace("/index.rsc", "/")
            : req.url;
        try {
            console.log("[stream] Handling RSC stream");
            const result = await createHandler(url, options, {
                loader: server.ssrLoadModule,
                moduleGraph: server.moduleGraph,
            });
            if (result.type === "error") {
                if (result.error.message?.includes("module runner has been closed")) {
                    console.log("[RSC] Module runner closed, returning 503");
                    res.writeHead(503, { "Content-Type": "text/x-component" });
                    res.end('{"error":"Server restarting..."}');
                    return;
                }
                console.error("[RSC] Stream error:", result.error);
                res.writeHead(500, { "Content-Type": "text/x-component" });
                res.end('{"error":"Internal Server Error"}');
                return;
            }
            if (result.type !== "success") {
                res.end();
                return;
            }
            res.setHeader("Content-Type", "text/x-component");
            if (result.stream)
                result.stream.pipe(res);
        }
        catch (error) {
            if (error.message?.includes("module runner has been closed")) {
                console.log("[RSC] Module runner closed, returning 503");
                res.writeHead(503, { "Content-Type": "text/x-component" });
                res.end('{"error":"Server restarting..."}');
                return;
            }
            next(error);
        }
    };
}
//# sourceMappingURL=createDevMiddleware.js.map