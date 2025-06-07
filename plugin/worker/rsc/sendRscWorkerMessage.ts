import type { RscWorkerOutputMessage } from "./types.js";
import { sendMessage } from "../sendMessage.js";

export const sendRscWorkerMessage = sendMessage as (
    msg: RscWorkerOutputMessage,
    port?: MessagePort
  ) => void;