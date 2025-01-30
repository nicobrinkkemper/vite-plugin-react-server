import React from "react";

export const useEventListener = <T extends HTMLElement | (Window & typeof globalThis)>(
  event: string,
  callback: (e: Event) => void,
  element: T = window as T
) => {
  const cbRef = React.useRef(callback);
  const eventRef = React.useRef(event);
  const elementRef = React.useRef<T>(element);
  cbRef.current = callback;
  eventRef.current = event;
  elementRef.current = element;

  React.useEffect(() => {
    elementRef.current.addEventListener(eventRef.current, cbRef.current);
    return () => elementRef.current.removeEventListener(eventRef.current, cbRef.current);
  }, []);
};
