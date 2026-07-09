import { env } from "#env";
import { createCallServer } from "./createCallServer.js";

export const callServer = createCallServer(env?.BASE_URL ?? "/");
