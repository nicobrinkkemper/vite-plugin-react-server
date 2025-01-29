export interface ViteReactClientTransformOptions {
  projectRoot?: string;
  moduleId?: (path: string, ssr: boolean) => string;
  validateModuleId?: (moduleId: string) => boolean;
  include?: string | RegExp | (string | RegExp)[];
  exclude?: string | RegExp | (string | RegExp)[];
}

export interface TransformerOptions {
  moduleId: (path: string, ssr: boolean) => string;
  /**
   * Optional validation function for module IDs
   */
  validateModuleId?: (moduleId: string) => boolean;
}