export const pageURL = () => {
  const pathname = window.location.pathname;
  const baseUrl = import.meta.env.BASE_URL;
  
  // Remove base URL from pathname if it exists
  const relativePath = pathname.startsWith(baseUrl) 
    ? pathname.slice(baseUrl.length) 
    : pathname;

  // Handle root path and index.html
  if (relativePath === '/' || relativePath === '' || relativePath === '/index.html' || relativePath === 'index.html') {
    return new URL('/index.rsc', window.location.origin);
  }

  // Get the path without extension and remove any trailing index
  const pathWithoutExt = relativePath
    .replace(/\.(html|rsc)$/, '')
    .replace(/\/index$/, '');
  
  // Construct the RSC path
  const rscPath = pathWithoutExt === '' ? '/index.rsc' : `${pathWithoutExt}/index.rsc`;
  
  // Ensure no double slashes and ensure leading slash
  const cleanPath = ('/' + rscPath.replace(/\/+/g, '/')).replace(/\/+/g, '/');
  
  console.log("cleanPath", {cleanPath, rscPath, pathWithoutExt, relativePath, baseUrl, pathname})
  return new URL(cleanPath, window.location.origin);
};
