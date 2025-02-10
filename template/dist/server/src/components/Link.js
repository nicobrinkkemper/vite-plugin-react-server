"use client";
import React from "react";
const Link = ({ children, to, href, ...props }) => /* @__PURE__ */ React.createElement(
  "a",
  {
    ...props,
    href: typeof href === "string" ? href : to,
    onClick: (e) => {
      e.preventDefault();
      let localHref = href || to;
      const isBlank = localHref?.startsWith("http") || e.currentTarget && "target" in e.currentTarget && e.currentTarget.target.toLowerCase() === "_blank";
      const newTo = e.currentTarget && "href" in e.currentTarget ? e.currentTarget.href : localHref;
      if (isBlank) {
        if (newTo) window.location.href = newTo;
      }
      const newState = { to: newTo };
      window.history.pushState(newState, "", e.currentTarget.href);
      window.dispatchEvent(new PopStateEvent("popstate", { state: newState }));
    }
  },
  children
);
const LinkRef = Object.defineProperties(
  function(...args) {
    return Link.apply(null, args);
  },
  {
    $$typeof: { value: Symbol.for("react.client.reference") },
    $$id: { value: "/src/components/Link.js#Link" },
    $$filepath: { value: "/home/nico/code/vite-react-stream/template/src/components/Link.tsx" }
  }
);
export {
  LinkRef as Link
};
