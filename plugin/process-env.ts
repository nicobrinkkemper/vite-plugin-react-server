declare global {
  namespace NodeJS {
    interface ProcessEnv {
      VITE_BASE_URL: string;
      VITE_DEV: string;
      VITE_PROD: string;
      VITE_SSR: string;
      VITE_MODE: string;
      VITE_PUBLIC_ORIGIN: string;
    }
  }
}
export {};
