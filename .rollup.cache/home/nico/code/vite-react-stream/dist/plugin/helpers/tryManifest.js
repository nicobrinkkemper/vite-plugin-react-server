import { readFileSync } from "node:fs";
import { resolve } from "node:path";
export function tryManifest(options) {
    const manifestPath = resolve(options.root, options.outDir, ".vite", options.ssrManifest ? "ssr-manifest.json" : "manifest.json");
    try {
        const result = JSON.parse(readFileSync(manifestPath, "utf-8"));
        return {
            type: "success",
            manifest: result,
        };
    }
    catch (e) {
        console.log("No manifest found", manifestPath);
        return {
            type: "error",
            error: e,
        };
    }
}
//# sourceMappingURL=tryManifest.js.map