"use client";
import React, { useState } from "react";
function ClientComponent({ add, subtract }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const handleAdd = async () => {
    try {
      const sum = await add(2, 3);
      setResult(sum);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };
  const handleSubtract = async () => {
    try {
      const diff = await subtract(5, 2);
      setResult(diff);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("button", { onClick: handleAdd }, "Add 2 + 3"), /* @__PURE__ */ React.createElement("button", { onClick: handleSubtract }, "Subtract 5 - 2"), result !== null && /* @__PURE__ */ React.createElement("p", null, "Result: ", result), error && /* @__PURE__ */ React.createElement("p", null, "Error: ", error));
}
export {
  ClientComponent
};
