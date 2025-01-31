import type { InputOption } from "rollup";

export const mergeAsArray = (entries: InputOption) => {
  return Array.isArray(entries)
    ? entries
    : typeof entries === "object" && entries != null
    ? Object.values(entries)
    : typeof entries === "string"
    ? [entries]
    : [];
};
export const mergeAsObject = (entries: InputOption) => {
  return Array.isArray(entries)
    ? Object.fromEntries(entries.map((entry) => [entry, entry]))
    : typeof entries === "object" && entries != null
    ? entries
    : typeof entries === "string"
    ? { [entries]: entries }
    : {};
};

export const mergeInputs = (
  input: InputOption,
  input2: InputOption | undefined
) => {
  if (!input2) return input;
  return Array.isArray(input)
    ? [...input, ...mergeAsArray(input2)]
    : typeof input === "string"
    ? [input, ...mergeAsArray(input2)]
    : input != null && typeof input2 === "object" && input2 != null
    ? { ...input, ...mergeAsObject(input2) }
    : input != null
    ? input
    : Array.isArray(input2)
    ? input2
    : typeof input2 === "object" && input2 != null
    ? input2
    : typeof input2 === "string"
    ? input2
    : [];
};
