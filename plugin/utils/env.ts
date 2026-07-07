// Bracket access (`import.meta["env"]`) instead of `import.meta.env` so vprs's
// own Vite build does NOT statically expand this into a baked object literal.
// Expansion would inline vprs's build-time values (BASE_URL "/", empty origin)
// AND — once the env keys are preserved for the browser env-URL helper — emit
// `{ BASE_URL: import.meta.env.BASE_URL, … }`, which throws in raw-Node SSR
// (vprs is external there, so `import.meta.env` is undefined). Shipping the bare
// reference lets the CONSUMER's environment resolve it: the real `import.meta.env`
// in the browser / Vite SSR, and a harmless `undefined` in bare Node.
export const env = import.meta["env"];
