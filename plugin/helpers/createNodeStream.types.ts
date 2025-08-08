import type { Readable } from "stream";
import type { ReactNode } from "react";

export interface CreateNodeStreamOptions {
  rscStream?: Readable; // For client version
  element?: ReactNode; // For server version
  moduleRootPath: string;
  moduleBasePath: string;
  moduleBaseURL: string;
  logger?: any;
}

export type CreateNodeStreamResult = 
  | {
      type: "client";
      elements: any; // React element from RSC stream
    }
  | {
      type: "server";
      elements: any; // RSC stream from React element
    };

export type CreateNodeStreamFn = <
  Opt extends CreateNodeStreamOptions = CreateNodeStreamOptions
>(
  options: Opt
) => Promise<CreateNodeStreamResult>; 