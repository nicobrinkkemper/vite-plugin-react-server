import { env } from "./env.js";

export const pageURL = (
  baseUrl = env.BASE_URL,
  to = window.location.pathname
) => {
  // Get the path without extension and remove any trailing index
  const folderName = to.replace(/\[index.html]$/, "");
  // Construct the RSC path
  const rscPath =
    folderName + (folderName.endsWith("/") ? "" : "/") + "index.rsc";
  try {
    let moduleBaseURL = new URL(baseUrl, window.location.origin).toString();
    let indexRSC = new URL(rscPath, moduleBaseURL).toString();
    if(!baseUrl.endsWith('/')) {
      // ensure no trailing slash
      moduleBaseURL = moduleBaseURL.toString().replace(/\/$/, "");
    } else {
      // ensure trailing slash
      moduleBaseURL = moduleBaseURL.endsWith("/") ? moduleBaseURL : moduleBaseURL + "/";
    }
    return {
      indexRSC: indexRSC,
      moduleBaseURL: moduleBaseURL,
    };
  } catch (error) {
    console.error("Error parsing pageURL", error);
    return {
      indexRSC: '/index.rsc',
      moduleBaseURL: '/',
    };
  }
};
