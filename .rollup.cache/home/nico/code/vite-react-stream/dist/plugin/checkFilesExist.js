import { existsSync } from "node:fs";
import { resolve } from "node:path";
export async function checkFilesExist(pages, options, root) {
    const errors = [];
    const pageSet = new Set();
    const pageMap = new Map();
    // Check if files exist when string paths are provided
    if (typeof options.Page === "string") {
        const pagePath = resolve(root, options.Page);
        pageMap.set(options.Page, pagePath);
        if (!pageSet.has(pagePath)) {
            if (!existsSync(pagePath)) {
                errors.push(`Page file not found: ${pagePath}`);
            }
            pageSet.add(pagePath);
        }
    }
    else if (typeof options.Page === "function" && pages) {
        for (const page of pages) {
            const pagePath = options.Page(resolve(root, page));
            pageMap.set(page, pagePath);
            if (pageSet.has(pagePath)) {
                continue;
            }
            if (!existsSync(pagePath)) {
                errors.push(`Page file not found: ${pagePath}`);
            }
            pageSet.add(pagePath);
        }
    }
    const propsSet = new Set();
    const propsMap = new Map();
    if (typeof options.props === "string") {
        const propsPath = resolve(root, options.props);
        propsMap.set(options.props, propsPath);
        if (!propsSet.has(propsPath)) {
            if (!existsSync(propsPath)) {
                errors.push(`Props file not found: ${propsPath}`);
            }
            propsSet.add(propsPath);
        }
    }
    else if (typeof options.props === "function" && pages) {
        for (const page of pages) {
            const propsPath = options.props(resolve(root, page));
            propsMap.set(page, propsPath);
            if (propsSet.has(propsPath)) {
                continue;
            }
            if (!existsSync(propsPath)) {
                errors.push(`Props file not found: ${propsPath}`);
            }
            propsSet.add(propsPath);
        }
    }
    if (errors.length) {
        throw new Error("React Stream Plugin Validation:\n" + errors.join("\n"));
    }
    return { pageMap, pageSet, propsMap, propsSet };
}
//# sourceMappingURL=checkFilesExist.js.map