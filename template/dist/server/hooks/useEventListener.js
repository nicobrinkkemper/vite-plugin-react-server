import React from "react";
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
export {
  useEventListener
};
