import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
export async function copyDir(src, dest, options) {
    const entries = readdirSync(src);
    mkdirSync(dest, { recursive: true });
    for (const entry of entries) {
        const srcPath = join(src, entry);
        const destPath = join(dest, entry);
        const stat = statSync(srcPath);
        if (options?.filter && !options.filter(srcPath)) {
            continue;
        }
        if (stat.isDirectory()) {
            await copyDir(srcPath, destPath, options);
        }
        else {
            copyFileSync(srcPath, destPath);
        }
    }
}
//# sourceMappingURL=copy-dir.js.map