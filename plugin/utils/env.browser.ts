// Browser env source. Selected under the `browser` condition (package.json
// `imports` → `#env`), so this file is ONLY ever loaded in a browser bundle,
// never in Node. The consumer's Vite statically replaces each `import.meta.env`
// dot-access with a literal (vprs's self-referential define ships them unparsed
// from vprs's own build), so the emitted object is plain values — there is no
// runtime `import.meta.env` to be undefined, and no guard is needed.
export const env: ImportMetaEnv = import.meta.env;
