import type { FileWriteEvent } from "../types.js";

export type ReactStaticPluginOptions = {
  
};

export type ReactStaticEvent = FileWriteEvent | {
  type: 'build.start';
  data: {
    pages: string[];
    files: Array<[string, { page: string; props?: string }]>;
  };
};