import ReactDOMESM from "react-server-dom-esm/client.browser";
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
export {
  callServer
};
