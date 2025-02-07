import React from "react";
const Page = (props) => {
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, props.name), /* @__PURE__ */ React.createElement("img", { src: props.sprites.front_default, alt: props.name }), /* @__PURE__ */ React.createElement("code", null, JSON.stringify(props)));
};
export {
  Page
};
