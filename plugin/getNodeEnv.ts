declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "test" | "production";
    }
  }
}

export const validEnvs = ["development", "test", "production"] as [
  "development",
  "test",
  "production"
];

export const isValidEnv = (env: string): env is (typeof validEnvs)[number] =>
  validEnvs.includes(env as never);

export function getNodeEnv() {
  const env = process.env.NODE_ENV;
  if (!isValidEnv(env)) {
    return "production";
  }
  return env;
}
