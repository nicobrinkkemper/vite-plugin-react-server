// Typed route paths via declaration merging (the TanStack-style `Register`
// pattern — no codegen). Consumers augment `Register` with their route union to
// get autocomplete + checking on `Link`'s `to` and `navigate`:
//
//   declare module "vite-plugin-react-server/router/client" {
//     interface Register {
//       routes: "/" | "/greet/$name" | "/blog/$category/$slug";
//     }
//   }
//
// Without augmentation, route paths fall back to `string`.
export interface Register {}

export type RegisteredRoutes = Register extends {
  routes: infer R extends string;
}
  ? R
  : string;

// A navigable path: a registered route (autocompleted) OR any string — so
// concrete instances like "/greet/alice" are accepted while the patterns
// autocomplete. `string & {}` preserves the literal-union autocomplete.
export type ToPath = RegisteredRoutes | (string & {});
