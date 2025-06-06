
export function removeRanges(
    source: string,
    ranges: { start: number; end: number }[]
  ): string {
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