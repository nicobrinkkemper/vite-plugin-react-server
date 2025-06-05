import { SourceMapHandler } from "./sourceMap.js";

export function removeDirectives(source: string, directiveRanges: { start: number, end: number }[]): string {
  // Sort ranges by start position
  const sortedRanges = [...directiveRanges].sort((a, b) => a.start - b.start);

  // Remove ranges from source
  if (sortedRanges.length === 0) {
    return source;
  }

  // Remove directives from source using the provided ranges
  return SourceMapHandler.removeRanges(source, sortedRanges);
}
