import type { ConfigEnv, UserConfig } from "vite";
/**
 * Get environment variables for Vite, sets defaults to ensure the server can start with BASE_URL and PUBLIC_URL
 *
 * @param config - Vite configuration object
 * @param { isPreview: boolean } - Object containing a boolean indicating if the environment is for preview
 * @returns An object containing the environment variables
 */
export declare function getEnv(config: UserConfig, configEnv: ConfigEnv): {
    baseUrl: any;
    publicUrl: any;
    port: any;
    host: any;
    envPrefix: any;
    environmentName: any;
    env: any;
    define: any;
};
//# sourceMappingURL=getEnv.d.ts.map