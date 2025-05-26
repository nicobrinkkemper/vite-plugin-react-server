import { registerServerReference } from "react-server-dom-esm/server.node";
const add = registerServerReference(function add2(a, b) {
  return a + b;
}, "/src/page/actions.server.ts", "add");
const subtract = registerServerReference(function subtract2(a, b) {
  return a - b;
}, "/src/page/actions.server.ts", "subtract");
export {
  add,
  subtract
};
