import { basename } from "path";
import type { SourceMap } from "../types/sourceMap.js";

// VLQ encoding helpers
const VLQ_SHIFT = 5;
const VLQ_CONTINUATION_BIT = 1 << VLQ_SHIFT;
const VLQ_VALUE_MASK = VLQ_CONTINUATION_BIT - 1;
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodeVLQ(numbers: number[]): string {
  return numbers
    .map((num) => {
      // Convert to VLQ
      const vlq = num < 0 ? (-num << 1) | 1 : num << 1;

      let result = "";
      let value = vlq;

      do {
        let digit = value & VLQ_VALUE_MASK;
        value >>>= VLQ_SHIFT;
        if (value > 0) {
          digit |= VLQ_CONTINUATION_BIT;
        }
        result += BASE64_CHARS[digit];
      } while (value > 0);

      return result;
    })
    .join("");
}

export function decodeVLQ(str: string): number[] {
  const numbers: number[] = [];
  let value = 0;
  let shift = 0;
  let index = 0;

  while (index < str.length && !/[,;]/.test(str[index])) {
    const digit = BASE64_CHARS.indexOf(str[index]);
    if (digit === -1) break;

    value += (digit & VLQ_VALUE_MASK) << shift;

    if ((digit & VLQ_CONTINUATION_BIT) === 0) {
      const negate = value & 1;
      value >>>= 1;
      numbers.push(negate ? -value : value);
      value = shift = 0;
    } else {
      shift += VLQ_SHIFT;
    }

    index++;
  }

  return numbers;
}

export function readMappings(
  mappings: string,
  callback: (
    generatedLine: number,
    generatedColumn: number,
    sourceIndex: number,
    originalLine: number,
    originalColumn: number,
    nameIndex: number
  ) => void
) {
  let line = 1;
  let column = 0;
  let sourceIndex = 0;
  let originalLine = 1;
  let originalColumn = 0;
  let nameIndex = 0;

  const segments = mappings.split(";");
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment === "") {
      line++;
      column = 0;
      continue;
    }

    const parts = segment.split(",");
    for (let j = 0; j < parts.length; j++) {
      const part = parts[j];
      if (part === "") continue;

      const numbers = decodeVLQ(part);
      column += numbers[0];
      if (numbers.length > 1) {
        sourceIndex += numbers[1];
        originalLine += numbers[2];
        originalColumn += numbers[3];
        if (numbers.length > 4) {
          nameIndex += numbers[4];
        }
      }

      callback(
        line,
        column,
        sourceIndex,
        originalLine,
        originalColumn,
        nameIndex
      );
    }
  }
}

export function createMappingsSerializer() {
  let previousGeneratedLine = 1;
  let previousGeneratedColumn = 0;
  let previousOriginalFile = 0;
  let previousOriginalLine = 0;
  let previousOriginalColumn = 0;
  let previousNameIndex = 0;

  return function (
    generatedLine: number,
    generatedColumn: number,
    originalFile: number,
    originalLine: number,
    originalColumn: number,
    nameIndex: number
  ): string {
    // Reset column when moving to a new line
    if (generatedLine > previousGeneratedLine) {
      previousGeneratedColumn = 0;
      let lines = "";
      for (let i = previousGeneratedLine; i < generatedLine; i++) {
        lines += ";";
      }
      previousGeneratedLine = generatedLine;
      if (lines) return lines;
    }

    // Calculate deltas
    const segment = [
      generatedColumn - previousGeneratedColumn,
      originalFile - previousOriginalFile,
      originalLine - previousOriginalLine,
      originalColumn - previousOriginalColumn,
    ];

    if (nameIndex >= 0) {
      segment.push(nameIndex - previousNameIndex);
    }

    // Update previous values
    previousGeneratedColumn = generatedColumn;
    previousOriginalFile = originalFile;
    previousOriginalLine = originalLine;
    previousOriginalColumn = originalColumn;
    previousNameIndex = nameIndex;

    return encodeVLQ(segment) + ",";
  };
}

export function createSourceMap(
  originalSource: string,
  transformedSource: string,
  originalSourceMap?: any
): SourceMap {
  return {
    version: 3,
    file: basename(originalSource),
    sources: [originalSource],
    sourcesContent: [originalSource],
    names: [],
    mappings: "AAAA;", // Simple line mapping
    sourceRoot: "",
  };
}

export function updateSourceMap(
  sourceMap: SourceMap,
  originalSource: string,
  transformedSource: string
) {
  // Update the source map with the transformed source
  sourceMap.sourcesContent = [originalSource];
  sourceMap.mappings = "AAAA;"; // Simple line mapping
}