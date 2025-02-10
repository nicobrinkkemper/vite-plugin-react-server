import React from "react";
import styles from "./bidoof.module.css.js";
const Page = (props) => {
  return /* @__PURE__ */ React.createElement("html", null, /* @__PURE__ */ React.createElement("head", null, /* @__PURE__ */ React.createElement("title", null, props.title), /* @__PURE__ */ React.createElement("meta", { name: "description", content: props.description })), /* @__PURE__ */ React.createElement("body", { className: styles.Bidoof }, /* @__PURE__ */ React.createElement("h1", null, props.name), /* @__PURE__ */ React.createElement("div", { className: styles.Images }, /* @__PURE__ */ React.createElement("img", { src: props.sprites.front_shiny, alt: props.name, className: styles.Image }), /* @__PURE__ */ React.createElement("img", { src: props.sprites.back_shiny, alt: props.name, className: styles.Image })), /* @__PURE__ */ React.createElement("div", { className: styles.Images }, /* @__PURE__ */ React.createElement("img", { src: props.sprites.front_female, alt: props.name, className: styles.Image }), /* @__PURE__ */ React.createElement("img", { src: props.sprites.back_female, alt: props.name, className: styles.Image })), /* @__PURE__ */ React.createElement("div", { className: styles.Images }, /* @__PURE__ */ React.createElement("img", { src: props.sprites.front_shiny, alt: props.name, className: styles.Image }), /* @__PURE__ */ React.createElement("img", { src: props.sprites.back_shiny, alt: props.name, className: styles.Image })), /* @__PURE__ */ React.createElement("code", { className: styles.Code }, JSON.stringify(props))));
};
export {
  Page
};
