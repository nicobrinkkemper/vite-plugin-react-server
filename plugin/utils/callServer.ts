import { env } from "./env.js";
import { createCallServer } from "./createCallServer.js";

export const callServer = createCallServer(env.BASE_URL);
