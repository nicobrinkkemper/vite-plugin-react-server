import type { SerializableRecord } from "../types.js";

export function cleanObject<T>(
  obj: T,
  knownNonSerializableFunctions: Set<string>,
  currentPath: string = ""
): Extract<SerializableRecord, T> {
  if (obj === null || obj === undefined)
    return obj as Extract<SerializableRecord, T>;
  if (typeof obj !== "object") return obj as Extract<SerializableRecord, T>;
  if (Array.isArray(obj)) {
    return obj
      .map((x, i) =>
        cleanObject(x, knownNonSerializableFunctions, `${currentPath}[${i}]`)
      )
      .filter((x) => x !== undefined) as Extract<SerializableRecord, T>;
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = currentPath ? `${currentPath}.${key}` : key;
    // handle array [n] to []
    if (
      typeof value === "function" ||
      knownNonSerializableFunctions.has(fullPath.replace(/\[\d+\]/g, "[]"))
    ) {
      // Skip functions and known non-serializable properties
      continue;
    } else if (typeof value === "object" && value !== null) {
      const cleaned = cleanObject(
        value,
        knownNonSerializableFunctions,
        fullPath
      );
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    } else {
      result[key] = value;
    }
  }
  return (Object.keys(result).length > 0 ? result : {}) as Extract<
    SerializableRecord,
    T
  >;
}
