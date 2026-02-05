import type { SerializableRecord } from "../types.js";

function serializeRegExp(regex: RegExp) {
  return { source: regex.source, flags: regex.flags, __isRegExp: true };
}

function isScalar(x: unknown): boolean {
  if (x == null) return true;
  const t = typeof x;
  if (t === "number" || t === "bigint" || t === "boolean" || t === "string")
    return true;
  // Preserve binary data (Buffer, TypedArrays)
  if (x instanceof Buffer || ArrayBuffer.isView(x)) return true;
  return false;
}

/**
 * Recursively strips functions and known non-serializable keys from an object.
 * Converts RegExp instances to a serializable form.
 */
export function cleanObject<T>(
  obj: T,
  nonSerializable: Set<string> = new Set(),
  path: string = ""
): SerializableRecord & T {
  if (obj == null || isScalar(obj))
    return obj as Extract<SerializableRecord, T>;

  if (obj instanceof RegExp)
    return serializeRegExp(obj) as unknown as Extract<SerializableRecord, T>;

  if (Array.isArray(obj)) {
    return obj
      .map((x, i) => cleanObject(x, nonSerializable, `${path}[${i}]`))
      .filter((x) => x !== undefined) as Extract<SerializableRecord, T>;
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj as Record<string, any>)) {
    const fullPath = path ? `${path}.${key}` : key;
    const normalized = fullPath.replace(/\[\d+\]/g, "[]");

    if (isScalar(value)) {
      result[key] = value;
      continue;
    }

    if (
      typeof value === "function" ||
      nonSerializable.has(normalized) ||
      nonSerializable.has(key)
    ) {
      continue;
    }

    if (value instanceof RegExp) {
      result[key] = serializeRegExp(value);
      continue;
    }

    if (typeof value === "object" && value !== null) {
      // Skip objects that contain functions
      const hasFn = Object.values(value).some(
        (v) =>
          typeof v === "function" ||
          nonSerializable.has(`${normalized}.${String(v)}`)
      );
      if (hasFn) continue;

      const cleaned = cleanObject(value, nonSerializable, normalized);
      if (cleaned !== undefined && Object.keys(cleaned).length > 0) {
        result[key] = cleaned;
      }
    }
  }

  return (Object.keys(result).length > 0 ? result : {}) as Extract<
    SerializableRecord,
    T
  >;
}
