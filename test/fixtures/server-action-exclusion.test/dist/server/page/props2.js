import { subtract, add } from "./actions.server2.js";
import "react-server-dom-esm/server.node";
const props = async () => {
  return {
    add,
    subtract
  };
};
export {
  props
};
