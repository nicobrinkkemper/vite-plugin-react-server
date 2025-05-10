import type { SerializableRecord } from "../types.js";

// Helper function to serialize RegExp objects
function serializeRegExp(regex: RegExp): { source: string; flags: string; __isRegExp: boolean } {
  return {
    source: regex.source,
    flags: regex.flags,
    __isRegExp: true
  };
}

export function cleanObject<T>(obj: T, knownNonSerializableFunctions: Set<string> = new Set(), currentPath: string = ''): SerializableRecord & T {
  if (obj === null || obj === undefined) return obj as Extract<SerializableRecord, T>;
  if (typeof obj !== 'object') return obj as Extract<SerializableRecord, T>;
  if (obj instanceof RegExp) return serializeRegExp(obj) as unknown as Extract<SerializableRecord, T>;
  if (Array.isArray(obj)) {
    return obj.map((x, i) => cleanObject(x, knownNonSerializableFunctions, `${currentPath}[${i}]`)).filter(x => x !== undefined) as Extract<SerializableRecord, T>;
  }
  
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = currentPath ? `${currentPath}.${key}` : key;
    const normalizedPath = fullPath.replace(/\[\d+\]/g, '[]');
    // Skip if it's a function or known non-serializable property
    if (typeof value === 'function' || knownNonSerializableFunctions.has(normalizedPath) || knownNonSerializableFunctions.has(key)) {
      continue;
    }

    // Handle nested objects
    if (typeof value === 'object' && value !== null) {
      // Check if the object has any functions
      const hasFunctions = Object.entries(value).some(([k, v]) => {
        const nestedPath = `${normalizedPath}.${k}`;
        return typeof v === 'function' || knownNonSerializableFunctions.has(nestedPath);
      });

      if (hasFunctions) {
        continue;
      }

      const cleaned = cleanObject(value, knownNonSerializableFunctions, `${normalizedPath}.${key}`);
      if (cleaned !== undefined && Object.keys(cleaned).length > 0) {
        result[key] = cleaned;
      }
    } else {
      result[key] = value;
    }
  }
  return (Object.keys(result).length > 0 ? result : {}) as Extract<SerializableRecord, T>;
}