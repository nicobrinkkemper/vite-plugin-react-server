import { ReactDOMServer } from "../vendor/vendor.server.js";

const { createTemporaryReferenceSet } = ReactDOMServer;

export const temporaryReferences = createTemporaryReferenceSet();
