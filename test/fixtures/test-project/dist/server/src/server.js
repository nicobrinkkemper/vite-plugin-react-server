"use server";
import React from "react";
function TestServerAction() {
  return React.createElement("div", null, "Server");
}
const TestServerActionRef = Object.defineProperties(
  function(...args) {
    return TestServerAction.apply(null, args);
  },
  {
    $$typeof: { value: Symbol.for("react.server.reference") },
    $$id: { value: "/src/server.tsx#TestServerAction" },
    $$filepath: { value: "/home/nico/code/vite-react-stream/test/fixtures/test-project/src/server.tsx" },
    $$async: { value: true }
  }
);
export {
  TestServerActionRef as TestServerAction
};
