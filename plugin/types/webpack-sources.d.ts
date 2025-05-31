declare module 'webpack-sources/lib/helpers/readMappings.js' {
  export default function readMappings(
    mappings: string,
    callback: (
      generatedLine: number,
      generatedColumn: number,
      sourceIndex: number,
      originalLine: number,
      originalColumn: number,
      nameIndex: number
    ) => void
  ): void;
}

declare module 'webpack-sources/lib/helpers/createMappingsSerializer.js' {
  export default function createMappingsSerializer(): (
    generatedLine: number,
    generatedColumn: number,
    sourceIndex: number,
    originalLine: number,
    originalColumn: number,
    nameIndex: number
  ) => string;
} 