import React from "react";
import { Link as LinkRef } from "../components/Link.js";
import styles from "./home.module.css.js";
const Page = ({ url }) => {
  return /* @__PURE__ */ React.createElement("html", null, /* @__PURE__ */ React.createElement("head", null, /* @__PURE__ */ React.createElement("title", null, "Home"), /* @__PURE__ */ React.createElement("meta", { name: "description", content: "Home" })), /* @__PURE__ */ React.createElement("body", null, /* @__PURE__ */ React.createElement("div", { className: styles["Home"] }, "You are on ", url, ". Go see a pokemon ", /* @__PURE__ */ React.createElement(LinkRef, { to: "/bidoof/" }, "here"))));
};
export {
  Page
};
