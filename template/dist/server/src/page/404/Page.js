import React from "react";
import styles from "./404.module.css.js";
const Page = (props) => {
  return /* @__PURE__ */ React.createElement("html", null, /* @__PURE__ */ React.createElement("head", null, /* @__PURE__ */ React.createElement("title", null, props.title), /* @__PURE__ */ React.createElement("meta", { name: "description", content: props.description })), /* @__PURE__ */ React.createElement("body", { className: styles.NotFound }, /* @__PURE__ */ React.createElement("h1", null, "404")));
};
export {
  Page
};
