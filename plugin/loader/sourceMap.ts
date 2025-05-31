import { createMappingsSerializer } from "../source-map/createMappingsSerializer.js";
import type { SourceMap } from "../types/sourceMap.js";
import { basename } from "path";

/**
 * Creates a basic source map for a module
 */
export function createBasicSourceMap(url: string, source: string): SourceMap {
  const createMapping = createMappingsSerializer();
  let mappings = '';
  let lineCount = 1;
  let idx = -1;

  // Map each line with VLQ encoding
  while ((idx = source.indexOf('\n', idx + 1)) !== -1) {
    createMapping(lineCount, 0, 0, lineCount, 0, -1);
    lineCount++;
  }
  // Add final line
  createMapping(lineCount, 0, 0, lineCount, 0, -1);

  return {
    version: 3,
    file: basename(url),
    sources: [url],
    sourcesContent: [source],
    mappings,
    sourceRoot: '',
    names: []
  };
}

/**
 * Extends an existing source map with new lines
 */
export function extendSourceMap(sourceMap: SourceMap, newLines: number, originalSource: string): SourceMap {
  const createMapping = createMappingsSerializer();
  let mappings = sourceMap.mappings || '';
  let lineCount = originalSource.split('\n').length;
  
  // Add padding for new lines
  for (let i = 0; i < newLines; i++) {
    createMapping(lineCount + i, 0, 0, lineCount + i, 0, -1);
  }

  return {
    ...sourceMap,
    version: 3,
    sourcesContent: [originalSource],
    mappings
  };
}

/**
 * Adds a source map as a base64 data URL to the source code
 */
export function addSourceMapToSource(source: string, sourceMap: SourceMap): string {
  // Convert version to number for serialization
  const serializedMap = {
    ...sourceMap,
    version: Number(sourceMap.version)
  };
  return source + '\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,' + 
    Buffer.from(JSON.stringify(serializedMap)).toString('base64');
}

/**
 * Detects and extracts source map URL from source code
 */
export function detectSourceMapURL(source: string): { url: string | null; start: number; end: number; lines: number } {
  let sourceMappingURL: string | null = null;
  let sourceMappingStart = 0;
  let sourceMappingEnd = 0;
  let sourceMappingLines = 0;

  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('# sourceMappingURL=') || line.includes('@ sourceMappingURL=')) {
      const match = line.match(/(?:#|@) sourceMappingURL=(.+)/);
      if (match) {
        sourceMappingURL = match[1];
        sourceMappingStart = source.indexOf(line);
        sourceMappingEnd = sourceMappingStart + line.length;
        sourceMappingLines = 1;
      }
    }
  }

  return { url: sourceMappingURL, start: sourceMappingStart, end: sourceMappingEnd, lines: sourceMappingLines };
}

/**
 * Strips source map URL comment from source code
 */
export function stripSourceMapURL(source: string, sourceMapInfo: { start: number; end: number; lines: number }): string {
  if (sourceMapInfo.start === 0 && sourceMapInfo.end === 0) {
    return source;
  }
  return source.slice(0, sourceMapInfo.start) + 
    '\n'.repeat(sourceMapInfo.lines) + 
    source.slice(sourceMapInfo.end);
}

/**
 * Creates a source map with the given parameters
 */
export function createSourceMap(id: string, code: string, mappings: string): SourceMap {
  return {
    version: 3,
    file: basename(id),
    sources: [id],
    sourcesContent: [code],
    names: [],
    mappings,
    sourceRoot: "",
  };
} 