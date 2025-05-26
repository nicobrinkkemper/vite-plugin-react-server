import React from "react";
import { ClientComponent } from "./ClientComponent.client-BobcF_NA.js";
import "react-server-dom-esm/server.node";
async function Page({ add, subtract }) {
  const addResult = await add(2, 3);
  const subtractResult = await subtract(5, 2);
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "Server Actions Test"), /* @__PURE__ */ React.createElement("p", null, "Server-side Add: ", addResult), /* @__PURE__ */ React.createElement("p", null, "Server-side Subtract: ", subtractResult), /* @__PURE__ */ React.createElement(ClientComponent, { add, subtract }));
}
export {
  Page
};
