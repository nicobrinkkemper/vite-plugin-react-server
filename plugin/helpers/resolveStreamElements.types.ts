export interface ResolveStreamElementsOptions {
  route: string;
  moduleRootPath?: string; // Made optional since it can come from userOptions
  pagePath?: string;
  propsPath?: string;
  rootPath?: string;
  htmlPath?: string;
  moduleBaseURL: string;
  verbose?: boolean;
  logger?: any;
  // Optional user options for standalone usage
  userOptions?: any;
}

export type ResolveStreamElementsResult = 
  | {
      type: "client";
      elements: any; // React element from hydrated RSC stream
    }
  | {
      type: "server";
      elements: any; // React element that can be passed to renderToPipeableStream
    };

export type ResolveStreamElementsFn = <
  Opt extends ResolveStreamElementsOptions = ResolveStreamElementsOptions
>(
  options: Opt
) => Promise<ResolveStreamElementsResult>; 