/**
 * Simplifies the route string to a string to can be concatenated with the base URL.
 * 
 * Pass the configured baseURL and it will be removed from the route.
 * 
 * @param route - The route to convert to a URL.
 * @param baseURL - The base URL to use.
 * @param fileName - The file name to use.
 * @returns The URL.
 */
export const routeToURL = (
  route: string,
  baseURL: string,
  fileName: string = "index.rsc"
) => {
  let url = !route || route === "" ? "/" : route;
  let shouldRemoveBaseURL =
    baseURL !== "" && url.startsWith(baseURL);
  if (shouldRemoveBaseURL) {
    url = url.slice(baseURL.length);
  }
  let shouldRemoveFileName = url.endsWith(fileName);
  if (shouldRemoveFileName) {
    url = url.slice(0, -fileName.length);
  }
  if(url.startsWith('/') && baseURL.endsWith('/')) {
    url = url.slice(1);
  }
  if(!url.endsWith('/')) {
    url = `${url}/`;
  }
  return `${url}`;
};
