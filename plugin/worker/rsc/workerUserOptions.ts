import { hydrateUserOptions } from "../../helpers/hydrateUserOptions.js";
import { workerData } from "node:worker_threads";
import type { SerializableHandlerOptions } from "../../helpers/createSerializableHandlerOptions.js";


export const safeWorkerUserOptions = (
  initMessage: Pick<
    SerializableHandlerOptions,
    | "moduleBase"
    | "moduleBasePath"
    | "moduleBaseURL"
    | "moduleRootPath"
    | "build"
    | "dev"
    | "css"
    | "autoDiscover"
  >,
  workerDataOptions = workerData?.userOptions
) => hydrateUserOptions({
    ...workerDataOptions,
    ...initMessage,
    // Deep merge build config if both exist
    build: {
      ...workerDataOptions,
      ...initMessage?.build,
    },
    dev: {
      ...workerDataOptions,
      ...initMessage?.dev,
    },
    css: {
      ...workerDataOptions,
      ...initMessage?.css,
    },
    autoDiscover: {
      ...workerDataOptions,
      ...initMessage?.autoDiscover,
    },
  });

export const workerUserOptions = (
  initMessage: Pick<
    SerializableHandlerOptions,
    | "moduleBase"
    | "moduleBasePath"
    | "moduleBaseURL"
    | "moduleRootPath"
    | "build"
    | "dev"
    | "css"
    | "autoDiscover"
  >,
  workerDataOptions = workerData?.userOptions
) => {
  // First hydrate the base user options from workerData
  const userOptionsResult = safeWorkerUserOptions(initMessage, workerDataOptions);
  
  if (userOptionsResult.type === "error") {
    throw userOptionsResult.error;
  }
  
  return userOptionsResult.userOptions;
};
