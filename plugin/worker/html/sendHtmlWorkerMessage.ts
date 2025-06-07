import { sendMessage } from "../sendMessage.js";
import type { HtmlWorkerOutputMessage } from "./types.js";

export const sendHtmlWorkerMessage = sendMessage as (
    msg: HtmlWorkerOutputMessage,
    port?: MessagePort
  ) => void;
  