// alternative to webpack-sources/lib/helpers/readMappings.js
export function readMappings(
  mappings: string,
  onMapping: (
    generatedLine: number,
    generatedColumn: number,
    sourceIndex: number,
    originalLine: number,
    originalColumn: number,
    nameIndex: number
  ) => void
) {
  let generatedLine = 1;
  let generatedColumn = 0;
  let sourceIndex = 0;
  let originalLine = 1;
  let originalColumn = 0;
  let nameIndex = 0;
  let i = 0;
  while (i < mappings.length) {
    if (mappings[i] === ";") {
      generatedLine++;
      generatedColumn = 0;
      i++;
    } else if (mappings[i] === ",") {
      i++;
    } else {
      let value = 0;
      let shift = 0;
      let hasMore = true;
      while (hasMore) {
        const c = mappings.charCodeAt(i++);
        if (c >= 65 && c <= 90) {
          value += (c - 65) << shift;
        } else if (c >= 97 && c <= 122) {
          value += (c - 97) << shift;
        } else if (c >= 48 && c <= 57) {
          value += (c - 48 + 26) << shift;
        } else if (c === 43) {
          value += 62 << shift;
        } else if (c === 47) {
          value += 63 << shift;
        } else {
          hasMore = false;
        }
        if (hasMore) {
          shift += 6;
        }
      }
      let isNegative = value & 1;
      value = value >> 1;
      if (isNegative) {
        value = -value;
      }
      generatedColumn += value;
      if (i < mappings.length && mappings[i] !== ";" && mappings[i] !== ",") {
        value = 0;
        shift = 0;
        hasMore = true;
        while (hasMore) {
          const c = mappings.charCodeAt(i++);
          if (c >= 65 && c <= 90) {
            value += (c - 65) << shift;
          } else if (c >= 97 && c <= 122) {
            value += (c - 97) << shift;
          } else if (c >= 48 && c <= 57) {
            value += (c - 48 + 26) << shift;
          } else if (c === 43) {
            value += 62 << shift;
          } else if (c === 47) {
            value += 63 << shift;
          } else {
            hasMore = false;
          }
          if (hasMore) {
            shift += 6;
          }
        }
        isNegative = value & 1;
        value = value >> 1;
        if (isNegative) {
          value = -value;
        }
        sourceIndex += value;
        if (i < mappings.length && mappings[i] !== ";" && mappings[i] !== ",") {
          value = 0;
          shift = 0;
          hasMore = true;
          while (hasMore) {
            const c = mappings.charCodeAt(i++);
            if (c >= 65 && c <= 90) {
              value += (c - 65) << shift;
            } else if (c >= 97 && c <= 122) {
              value += (c - 97) << shift;
            } else if (c >= 48 && c <= 57) {
              value += (c - 48 + 26) << shift;
            } else if (c === 43) {
              value += 62 << shift;
            } else if (c === 47) {
              value += 63 << shift;
            } else {
              hasMore = false;
            }
            if (hasMore) {
              shift += 6;
            }
          }
          isNegative = value & 1;
          value = value >> 1;
          if (isNegative) {
            value = -value;
          }
          originalLine += value;
          if (
            i < mappings.length &&
            mappings[i] !== ";" &&
            mappings[i] !== ","
          ) {
            value = 0;
            shift = 0;
            hasMore = true;
            while (hasMore) {
              const c = mappings.charCodeAt(i++);
              if (c >= 65 && c <= 90) {
                value += (c - 65) << shift;
              } else if (c >= 97 && c <= 122) {
                value += (c - 97) << shift;
              } else if (c >= 48 && c <= 57) {
                value += (c - 48 + 26) << shift;
              } else if (c === 43) {
                value += 62 << shift;
              } else if (c === 47) {
                value += 63 << shift;
              } else {
                hasMore = false;
              }
              if (hasMore) {
                shift += 6;
              }
            }
            isNegative = value & 1;
            value = value >> 1;
            if (isNegative) {
              value = -value;
            }
            originalColumn += value;
            if (
              i < mappings.length &&
              mappings[i] !== ";" &&
              mappings[i] !== ","
            ) {
              value = 0;
              shift = 0;
              hasMore = true;
              while (hasMore) {
                const c = mappings.charCodeAt(i++);
                if (c >= 65 && c <= 90) {
                  value += (c - 65) << shift;
                } else if (c >= 97 && c <= 122) {
                  value += (c - 97) << shift;
                } else if (c >= 48 && c <= 57) {
                  value += (c - 48 + 26) << shift;
                } else if (c === 43) {
                  value += 62 << shift;
                } else if (c === 47) {
                  value += 63 << shift;
                } else {
                  hasMore = false;
                }
                if (hasMore) {
                  shift += 6;
                }
              }
              isNegative = value & 1;
              value = value >> 1;
              if (isNegative) {
                value = -value;
              }
              nameIndex += value;
            }
          }
        }
      }
      onMapping(
        generatedLine,
        generatedColumn,
        sourceIndex,
        originalLine,
        originalColumn,
        nameIndex
      );
    }
  }
}
