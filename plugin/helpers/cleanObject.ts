import type { SerializableRecord } from "../types.js";

// Helper function to serialize RegExp objects
function serializeRegExp(regex: RegExp): {
  source: string;
  flags: string;
  __isRegExp: boolean;
} {
  return {
    source: regex.source,
    flags: regex.flags,
    __isRegExp: true,
  };
}

const isSerializable = (
  x: unknown
): x is
  | number
  | bigint
  | boolean
  | string
  | undefined
  | null
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Int8Array
  | Int16Array
  | Int32Array => {
  return (
    typeof x === "number" ||
    typeof x === "bigint" ||
    typeof x === "boolean" ||
    typeof x === "string" ||
    x instanceof Buffer ||
    (Array.isArray(x) &&
      (!x.length ||
        x instanceof Uint8Array ||
        x instanceof Uint16Array ||
        x instanceof Uint32Array ||
        x instanceof Int8Array ||
        x instanceof Int16Array ||
        x instanceof Int32Array))
  );
};

export function cleanObject<T>(
  obj: T,
  knownNonSerializableFunctions: Set<string> = new Set(),
  currentPath: string = ""
): SerializableRecord & T {
  if (typeof obj !== "object" || obj == null) return obj as Extract<SerializableRecord, T>;
  if (isSerializable(obj)) return obj as Extract<SerializableRecord, T>;
  if(obj instanceof RegExp) return serializeRegExp(obj) as unknown as Extract<SerializableRecord, T>;

  if (Array.isArray(obj)) {
    return obj
      .map((x, i) =>
        cleanObject(x, knownNonSerializableFunctions, `${currentPath}[${i}]`)
      )
      .filter((x) => x !== undefined) as Extract<SerializableRecord, T>;
  }
  if (obj instanceof RegExp)
    return serializeRegExp(obj) as unknown as Extract<SerializableRecord, T>;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = currentPath ? `${currentPath}.${key}` : key;
    const normalizedPath = fullPath.replace(/\[\d+\]/g, "[]");
    // Skip if it's a function or known non-serializable property
    if(isSerializable(value)) {
      result[key] = value;
      continue;
    }
    if (
      typeof value === "function" ||
      knownNonSerializableFunctions.has(normalizedPath) ||
      knownNonSerializableFunctions.has(key)
    ) {
      continue;
    }

    // Handle nested objects
    if (typeof value === "object" && value !== null) {
      // Check if the object has any functions
      const hasFunctions = Object.entries(value).some(([k, v]) => {
        const nestedPath = `${normalizedPath}.${k}`;
        return (
          typeof v === "function" ||
          knownNonSerializableFunctions.has(nestedPath)
        );
      });

      if (hasFunctions) {
        continue;
      }

      const cleaned = cleanObject(
        value,
        knownNonSerializableFunctions,
        `${normalizedPath}.${key}`
      );
      if (cleaned !== undefined && Object.keys(cleaned).length > 0) {
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
