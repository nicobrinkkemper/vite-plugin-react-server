import type { SerializableHandlerOptions } from "./createSerializableHandlerOptions.js";
import type { WorkerMessage } from "../worker/types.js";

/**
 * Base message type for all worker render operations
 * 
 * This provides a common foundation for all worker messages,
 * combining serializable handler options with worker-specific metadata.
 */
export interface BaseWorkerRenderMessage extends WorkerMessage {
    // Worker-specific metadata
    id: string;
    type: string;

    // Serializable handler options
    options: SerializableHandlerOptions;
}

/**
 * RSC Render Message - for RSC worker operations
 * 
 * This message type is specifically for RSC (React Server Components) rendering
 * in worker threads. It contains all the serializable options needed for RSC generation.
 */
export interface RscRenderMessage extends BaseWorkerRenderMessage {
    type: "INIT";
    options: SerializableHandlerOptions & {
        // RSC-specific options
        rscTimeout?: number;
    };
}

/**
 * HTML Render Message - for HTML worker operations
 * 
 * This message type is specifically for HTML rendering in worker threads.
 * It contains all the serializable options needed for HTML generation from RSC streams.
 */
export interface HtmlRenderMessage extends BaseWorkerRenderMessage {
    type: "INIT";
    options: SerializableHandlerOptions & {
        // HTML-specific options
        htmlTimeout?: number;
    };
}

/**
 * Component Resolution Message - for component loading operations
 * 
 * This message type is for requesting component resolution in workers.
 * Components are resolved from file paths rather than being passed directly.
 */
export interface ComponentResolutionMessage extends WorkerMessage {
    type: "COMPONENT_RESOLUTION";
    id: string;
    options: {
        pagePath: string;
        rootPath: string;
        htmlPath: string;
        pageExportName: string;
        rootExportName: string;
        htmlExportName: string;
        projectRoot: string;
        moduleRootPath: string;
        moduleBasePath: string;
    };
}

/**
 * Component Resolution Response - response to component resolution requests
 */
export interface ComponentResolutionResponse extends WorkerMessage {
    type: "COMPONENT_RESOLUTION_RESPONSE";
    id: string;
    success: boolean;
    components?: {
        PageComponent: any;
        RootComponent: any;
        HtmlComponent: any;
    };
    error?: string;
}

/**
 * Creates a properly typed RSC render message
 * 
 * @param id - Unique message ID
 * @param options - Serializable handler options
 * @returns Properly typed RSC render message
 */
export function createRscRenderMessage(
    id: string,
    options: SerializableHandlerOptions
): RscRenderMessage {
    return {
        id,
        type: "INIT",
        options,
    };
}

/**
 * Creates a properly typed HTML render message
 * 
 * @param id - Unique message ID
 * @param options - Serializable handler options
 * @returns Properly typed HTML render message
 */
export function createHtmlRenderMessage(
    id: string,
    options: SerializableHandlerOptions
): HtmlRenderMessage {
    return {
        id,
        type: "INIT",
        options: {
            ...options,
            htmlTimeout: options.htmlTimeout,
        },
    };
}

/**
 * Creates a component resolution message
 * 
 * @param id - Unique message ID
 * @param options - Component resolution options
 * @returns Properly typed component resolution message
 */
export function createComponentResolutionMessage(
    id: string,
    options: ComponentResolutionMessage["options"]
): ComponentResolutionMessage {
    return {
        id,
        type: "COMPONENT_RESOLUTION",
        options,
    };
}

/**
 * Union type for all worker render messages
 */
export type WorkerRenderMessage =
    | RscRenderMessage
    | HtmlRenderMessage
    | ComponentResolutionMessage
    | ComponentResolutionResponse;
