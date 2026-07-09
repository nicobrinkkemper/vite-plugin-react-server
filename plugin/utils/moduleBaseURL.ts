import { env } from "#env";

const { BASE_URL: baseURL, PUBLIC_ORIGIN: publicOrigin } = env;

const moduleBaseURL: string = `${publicOrigin}${baseURL}`;

export { moduleBaseURL };
