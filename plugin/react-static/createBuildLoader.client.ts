export function createBuildLoader() {
    // In client-static, the RSC worker handles all module loading
    // The main thread doesn't need to load modules directly
    return async function buildLoader(_id: string) {
        return { default: "" };
    };
}   