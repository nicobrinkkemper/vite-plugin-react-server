import type { LoadFnOutput } from "node:module";

declare module "node:module" {
  interface LoadFnOutput {
    map?: {
      version: number;
      file: string;
      sources: string[];
      sourcesContent: string[];
      names: string[];
      mappings: string;
      sourceRoot: string;
    } | null;
  }
} 