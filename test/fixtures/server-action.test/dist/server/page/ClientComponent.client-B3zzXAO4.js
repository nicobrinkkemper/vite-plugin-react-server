import { registerClientReference } from "react-server-dom-esm/server.node";
const ClientComponent = registerClientReference(function() {
  throw new Error("Attempted to call ClientComponent() from the server but ClientComponent is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "/page/ClientComponent.client-B3zzXAO4.js", "ClientComponent");
export {
  ClientComponent
};
