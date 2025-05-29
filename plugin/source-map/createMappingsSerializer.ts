// alternative to webpack-sources/lib/helpers/createMappingsSerializer.js
// unused for now, but it's a dependency of react-server-dom-esm and you may or may not want to download webpack-sources
export function createMappingsSerializer() {
    let generatedLine = 1;
    let generatedColumn = 0;
    let sourceIndex = 0;
    let originalLine = 1;
    let originalColumn = 0;
    let nameIndex = 0;
    let mappings = "";
  
    return function serializeMapping(
      newGeneratedLine: number,
      newGeneratedColumn: number,
      newSourceIndex: number,
      newOriginalLine: number,
      newOriginalColumn: number,
      newNameIndex: number
    ) {
      if (newGeneratedLine !== generatedLine) {
        generatedLine = newGeneratedLine;
        generatedColumn = newGeneratedColumn;
        if (mappings) {
          mappings += ";";
        }
      } else if (mappings) {
        mappings += ",";
      }
  
      // Encode the generated column.
      let value = newGeneratedColumn - generatedColumn;
      generatedColumn = newGeneratedColumn;
      let isNegative = value < 0;
      if (isNegative) {
        value = -value;
      }
      value = value << 1;
      if (isNegative) {
        value = value | 1;
      }
      while (value > 0) {
        let digit = value & 63;
        value = value >>> 6;
        if (value > 0) {
          digit = digit | 64;
        }
        mappings += String.fromCharCode(
          digit < 26
            ? digit + 65
            : digit < 52
            ? digit + 97 - 26
            : digit < 62
            ? digit + 48 - 52
            : digit === 62
            ? 43
            : 47
        );
      }
  
      // Encode the source index.
      value = newSourceIndex - sourceIndex;
      sourceIndex = newSourceIndex;
      isNegative = value < 0;
      if (isNegative) {
        value = -value;
      }
      value = value << 1;
      if (isNegative) {
        value = value | 1;
      }
      while (value > 0) {
        let digit = value & 63;
        value = value >>> 6;
        if (value > 0) {
          digit = digit | 64;
        }
        mappings += String.fromCharCode(
          digit < 26
            ? digit + 65
            : digit < 52
            ? digit + 97 - 26
            : digit < 62
            ? digit + 48 - 52
            : digit === 62
            ? 43
            : 47
        );
      }
  
      // Encode the original line.
      value = newOriginalLine - originalLine;
      originalLine = newOriginalLine;
      isNegative = value < 0;
      if (isNegative) {
        value = -value;
      }
      value = value << 1;
      if (isNegative) {
        value = value | 1;
      }
      while (value > 0) {
        let digit = value & 63;
        value = value >>> 6;
        if (value > 0) {
          digit = digit | 64;
        }
        mappings += String.fromCharCode(
          digit < 26
            ? digit + 65
            : digit < 52
            ? digit + 97 - 26
            : digit < 62
            ? digit + 48 - 52
            : digit === 62
            ? 43
            : 47
        );
      }
  
      // Encode the original column.
      value = newOriginalColumn - originalColumn;
      originalColumn = newOriginalColumn;
      isNegative = value < 0;
      if (isNegative) {
        value = -value;
      }
      value = value << 1;
      if (isNegative) {
        value = value | 1;
      }
      while (value > 0) {
        let digit = value & 63;
        value = value >>> 6;
        if (value > 0) {
          digit = digit | 64;
        }
        mappings += String.fromCharCode(
          digit < 26
            ? digit + 65
            : digit < 52
            ? digit + 97 - 26
            : digit < 62
            ? digit + 48 - 52
            : digit === 62
            ? 43
            : 47
        );
      }
  
      // Encode the name index.
      value = newNameIndex - nameIndex;
      nameIndex = newNameIndex;
      isNegative = value < 0;
      if (isNegative) {
        value = -value;
      }
      value = value << 1;
      if (isNegative) {
        value = value | 1;
      }
      while (value > 0) {
        let digit = value & 63;
        value = value >>> 6;
        if (value > 0) {
          digit = digit | 64;
        }
        mappings += String.fromCharCode(
          digit < 26
            ? digit + 65
            : digit < 52
            ? digit + 97 - 26
            : digit < 62
            ? digit + 48 - 52
            : digit === 62
            ? 43
            : 47
        );
      }
  
      return mappings;
    };
  }