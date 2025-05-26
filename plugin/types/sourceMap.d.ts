export interface SourceMap {
  version: number;
  file: string;
  sources: string[];
  sourcesContent: string[];
  names: string[];
  mappings: string;
  sourceRoot: string;
} 