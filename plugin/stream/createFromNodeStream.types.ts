import type React from "react";
import type { PassThrough } from "node:stream";

/**
 * Options for creating React elements from RSC streams
 */
export type CreateFromNodeStreamOptions<
  Env extends "client" | "server" = "client" | "server"
> = Env extends "client"
  ? {
      rscStream: PassThrough;
      moduleRootPath?: string;
      moduleBasePath?: string;
      moduleBaseURL?: string;
      logger?: any;
      verbose?: boolean;
    }
  : {
      model: React.ReactElement;
      moduleBasePath?: string;
      logger?: any;
      verbose?: boolean;
    };

/**
 * Result of creating React elements from RSC streams
 */
export interface FromNodeStreamResult {
  children: React.ReactElement;
}

/**
 * Function type for creating React elements from RSC streams
 */
export type CreateFromNodeStreamFn<
  Env extends "client" | "server" = "client" | "server"
> = <Opt extends CreateFromNodeStreamOptions<Env> = CreateFromNodeStreamOptions<Env>>(
  options: Opt
) => Env extends "client"
  ? FromNodeStreamResult & { type: "client" }
  : FromNodeStreamResult & { type: "server" };

// Legacy type aliases for backward compatibility
export type CreateNodeStreamOptions = CreateFromNodeStreamOptions;
export type CreateNodeStreamResult = FromNodeStreamResult;
export type CreateNodeStreamFn<
  Env extends "client" | "server" = "client" | "server"
> = CreateFromNodeStreamFn<Env>;
