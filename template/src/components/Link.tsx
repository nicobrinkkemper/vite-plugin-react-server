"use client";
import React from "react";

export const Link: React.FC<{
  children: React.ReactNode;
  to?: string;
  href?: string;
}> = ({ children, to, href, ...props }) => (
  <a
    {...props}
    href={typeof href === 'string' ? href : to}
    onClick={(e) => {
      e.preventDefault();
      let localHref = href || to;
      const isBlank =
        localHref?.startsWith("http") ||
        (e.currentTarget &&
          "target" in e.currentTarget &&
          e.currentTarget.target.toLowerCase() === "_blank");
      
      const newTo =
        e.currentTarget && "href" in e.currentTarget
          ? e.currentTarget.href
          : localHref;

        if (isBlank) {
          if(newTo) window.location.href = newTo
        }
      const newState = { to: newTo };
      window.history.pushState(newState, "", e.currentTarget.href);
      window.dispatchEvent(new PopStateEvent("popstate", { state: newState }));
    }}
  >
    {children}
  </a>
);
