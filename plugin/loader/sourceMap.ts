import type { RawSourceMap } from 'source-map';

/**
 * Source map handling utilities
 */

/**
 * Creates a source map for the given source code
 */
export function createSourceMap(
  code: string,
  originalSource: string,
  moduleId: string,
  rangesToRemove: { start: number; end: number }[] = []
): RawSourceMap {
  // Split code into lines for line-by-line mapping
  const lines = code.split('\n');
  
  // Track current positions in both original and transformed code
  let currentLine = 0;
  let currentColumn = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  
  // Generate mappings line by line
  const mappings: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    // Check if this line contains any ranges to remove
    const lineRanges = rangesToRemove.filter(range => {
      const rangeStartLine = originalSource.slice(0, range.start).split('\n').length - 1;
      const rangeEndLine = originalSource.slice(0, range.end).split('\n').length - 1;
      return rangeStartLine <= sourceLine && rangeEndLine >= sourceLine;
    });
    
    if (lineRanges.length > 0) {
      // Skip this line in the source map as it's being removed
      sourceLine++;
      // Add an empty mapping for this line
      mappings.push('');
      continue;
    }
    
    // Generate mapping for this line
    // Format: [generatedColumn, sourceIndex, sourceLine, sourceColumn]
    const mapping = [
      encodeVLQ([currentColumn]), // generated column
      encodeVLQ([0]), // source index (always 0 for now)
      encodeVLQ([sourceLine]), // source line
      encodeVLQ([sourceColumn]) // source column
    ].join('');
    
    mappings.push(mapping);
    
    // Update positions
    currentLine++;
    currentColumn = 0;
    sourceLine++;
    sourceColumn = 0;
  }

  // Join mappings with semicolons, ensuring empty lines are preserved
  const mappingsString = mappings.join(';');

  return {
    version: 3,
    file: moduleId,
    sources: [moduleId],
    names: [],
    mappings: mappingsString,
    sourceRoot: '',
    sourcesContent: [originalSource]
  };
}

/**
 * Encodes a series of integers into a VLQ string
 */
function encodeVLQ(values: number[]): string {
  const VLQ_BASE_SHIFT = 5;
  const VLQ_BASE = 1 << VLQ_BASE_SHIFT;
  const VLQ_BASE_MASK = VLQ_BASE - 1;
  const VLQ_CONTINUATION_BIT = VLQ_BASE;
  
  let result = '';
  
  for (let i = 0; i < values.length; i++) {
    let value = values[i];
    
    // Handle negative values
    if (value < 0) {
      value = (-value << 1) | 1;
    } else {
      value = value << 1;
    }
    
    // Encode the value
    do {
      let digit = value & VLQ_BASE_MASK;
      value >>>= VLQ_BASE_SHIFT;
      
      if (value !== 0) {
        digit |= VLQ_CONTINUATION_BIT;
      }
      
      result += encodeBase64Digit(digit);
    } while (value !== 0);
  }
  
  return result;
}

/**
 * Encodes a single digit into base64
 */
function encodeBase64Digit(digit: number): string {
  const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  return BASE64_CHARS[digit];
}

/**
 * Strips the source map URL from the source string
 */
export function stripSourceMap(source: string): string {
  return source.replace(
    /\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,[A-Za-z0-9+/=]+$/m,
    ""
  );
}

/**
 * Adds a source map URL to the source string
 */
export function addSourceMap(source: string, map: RawSourceMap): string {
  const sourceMapString = JSON.stringify(map);
  const sourceMapBase64 = Buffer.from(sourceMapString).toString("base64");
  return `${source}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${sourceMapBase64}`;
}

/**
 * Parses a source map URL from a source string
 */
export function parseSourceMapUrl(source: string): string | null {
  const match = source.match(
    /\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,([A-Za-z0-9+/=]+)$/m
  );
  if (!match) {
    return null;
  }
  return match[1];
}

/**
 * Decodes a base64 source map string
 */
export function decodeSourceMap(base64: string): RawSourceMap | null {
  try {
    const sourceMapString = Buffer.from(base64, "base64").toString();
    return JSON.parse(sourceMapString);
  } catch (error) {
    console.error("Failed to decode source map:", error);
    return null;
  }
}

export class SourceMapHandler {
  private sourceMap: RawSourceMap | null = null;
  private sourceMapUrl: string | null = null;

  constructor() {}

  addToSource(source: string): string {
    if (!this.sourceMapUrl) {
      return source;
    }
    // Ensure the source map is properly attached with a newline
    return `${source}\n//# sourceMappingURL=${this.sourceMapUrl}`;
  }

  getSourceMap(): RawSourceMap | null {
    return this.sourceMap;
  }

  getSourceMapUrl(): string | null {
    return this.sourceMapUrl;
  }

  static detectSourceMap(source: string): string | null {
    const match = source.match(/\/\/# sourceMappingURL=(.+)$/m);
    return match ? match[1] : null;
  }

  static parseSourceMapUrl(url: string): RawSourceMap | null {
    try {
      const base64 = url.replace('data:application/json;charset=utf-8;base64,', '');
      const decoded = Buffer.from(base64, 'base64').toString();
      return JSON.parse(decoded);
    } catch (e) {
      console.error('Failed to parse source map:', e);
      return null;
    }
  }

  static removeRanges(source: string, ranges: { start: number; end: number }[]): string {
    if (!ranges.length) {
      return source;
    }

    // Sort ranges by start position
    ranges.sort((a, b) => a.start - b.start);

    // Remove ranges from end to start to avoid position shifts
    let result = source;
    for (let i = ranges.length - 1; i >= 0; i--) {
      const { start, end } = ranges[i];
      result = result.slice(0, start) + result.slice(end);
    }

    return result;
  }
} 