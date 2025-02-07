"use strict";
const isServer = process.env['NODE_OPTIONS']?.match(/--conditions[= ]react-server/);
export const viteReactServer = async (options) => {
    if (!isServer) {
        return () => { };
    }
    else {
        const module = await import('./server.js');
        return module.reactStreamPlugin(options);
    }
};
export const viteReactClient = async (options) => {
    if (isServer) {
        return () => { };
    }
    else {
        const module = await import('./client.js');
        return module.reactStreamPlugin(options);
    }
};
export const viteReactStream = (options) => {
    if (isServer) {
        return viteReactClient(options);
    }
    else {
        return viteReactServer(options);
    }
};
//# sourceMappingURL=index.js.map