// Loader for the `/greet` section layout (greet/route.tsx). Shared by the
// segment; demonstrates a per-layer nested loader distinct from the leaf page's
// own props (greet/$name/props.ts → { name }).
export const props = () => ({ section: "Greetings" });
