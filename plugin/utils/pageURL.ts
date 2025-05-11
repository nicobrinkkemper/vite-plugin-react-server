export const pageURL = () => {
  const base = (
    import.meta.env["BASE_URL"] +
    (window.location.pathname.startsWith(import.meta.env["BASE_URL"])
      ? window.location.pathname.slice(import.meta.env["BASE_URL"].length)
      : window.location.pathname) +
    "/index.rsc"
  ).replace(/\/\//g, "/");
  // make relative to current path, including trailing slash
  if(window.location.href.endsWith("/")) {
    return new URL(base, window.location.origin.slice(0, -1))
  }
  return new URL(base, window.location.origin)
};
