import { SourceMap } from 'node:module';
import type { RawSourceMap } from 'source-map';

export function createSourceMap(source: string, originalSource: string, moduleId: string): string {
  // Handle empty content
  if (!source && !originalSource) {
    return source;
  }

  // Generate mappings based on the source content
  const sourceLines = source.split('\n');
  const mappings = sourceLines.length === 0 ? '' : sourceLines.map((_, i) => i === 0 ? 'AAAA' : 'AACA').join(';');

  const sourceMap = new SourceMap({
    version: 3,
    file: moduleId,
    sources: [moduleId],
    sourcesContent: [originalSource || ''],
    mappings,
    sourceRoot: '',
    names: []
  });

  return `${source}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${Buffer.from(JSON.stringify(sourceMap.payload)).toString('base64')}`;
}

export function stripSourceMap(source: string): string {
  return source.replace(/\/\/# sourceMappingURL=.+$/m, '');
}

export class SourceMapHandler {
  private sourceMap: RawSourceMap | null = null;
  private sourceMapUrl: string | null = null;

  constructor() {}

  addToSource(source: string): string {
    if (!this.sourceMapUrl) {
      return source;
    }
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
      return JSON.parse(Buffer.from(base64, 'base64').toString());
    } catch (e) {
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