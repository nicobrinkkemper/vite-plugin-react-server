"use client";
import React, { useTransition, useState, useCallback, use } from "react";
import { createRoot } from "react-dom/client";
import ReactDOMESM from "react-server-dom-esm/client.browser";
const useEventListener = (event, callback, element = window) => {
  const cbRef = React.useRef(callback);
  const eventRef = React.useRef(event);
  const elementRef = React.useRef(element);
  cbRef.current = callback;
  eventRef.current = event;
  elementRef.current = element;
  React.useEffect(() => {
    elementRef.current.addEventListener(eventRef.current, cbRef.current);
    return () => elementRef.current.removeEventListener(eventRef.current, cbRef.current);
  }, []);
};
const host = "";
const moduleBaseURL = host + "/src";
const callServer = async (id, args) => {
  console.log("Fetching", id);
  const response = await ReactDOMESM.createFromFetch(
    fetch(host, {
      method: "POST",
      body: await ReactDOMESM.encodeReply(args),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    }),
    { callServer, moduleBaseURL }
  );
  const returnValue = response.returnValue;
  return returnValue;
};
function createReactFetcher({
  url = window.location.pathname,
  moduleBaseURL: moduleBaseURL2 = "/src",
  headers = { Accept: "text/x-component" }
} = {}) {
  return ReactDOMESM.createFromFetch(
    fetch(url, {
      headers
    }),
    {
      callServer,
      moduleBaseURL: new URL(moduleBaseURL2, window.origin).href
    }
  );
}
const Shell = ({ data: initialServerData }) => {
  const [, startTransition] = useTransition();
  const [storeData, setStoreData] = useState(initialServerData);
  const navigate = useCallback((to) => {
    if ("scrollTo" in window) window.scrollTo(0, 0);
    startTransition(() => {
      setStoreData(
        createReactFetcher({
          url: to.endsWith("/") ? to + "index.rsc" : to + "/index.rsc"
        })
      );
    });
  }, []);
  useEventListener("popstate", (e) => {
    console.log(e);
    if (e instanceof PopStateEvent && e.state?.to) {
      return navigate(e.state.to);
    } else {
      return navigate(window.location.pathname);
    }
  });
  const content = use(storeData);
  return /* @__PURE__ */ React.createElement(ErrorBoundary, null, content);
};
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
const intitalData = createReactFetcher({
  url: new URL("index.rsc", window.location.href).href
});
createRoot(rootElement).render(/* @__PURE__ */ React.createElement(Shell, { data: intitalData }));
const Redirect = ({ search }) => {
  React.useEffect(() => {
    if (import.meta?.["env"]?.["DEV"] || window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1")) {
      return;
    }
    if (!window.location.href.includes("/404")) {
      const timeout = setTimeout(() => {
        window.location.href = "/404" + search;
      }, 1e3);
      return () => clearTimeout(timeout);
    }
  }, []);
  return null;
};
class ErrorBoundary extends React.Component {
  state = {
    hasError: false,
    error: null
  };
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  componentDidCatch(error) {
    console.error(error);
    this.setState({
      hasError: true,
      error: error instanceof Error ? error : new Error("Error", {
        cause: error
      })
    });
  }
  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return /* @__PURE__ */ React.createElement(Redirect, { search: `?error=${this.state.error?.message}` });
  }
}
