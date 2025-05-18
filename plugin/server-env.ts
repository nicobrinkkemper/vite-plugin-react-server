declare global {
  namespace NodeJS {
    interface ProcessEnv {
      VITE_BASE_URL: string;
      VITE_DEV: boolean;
      VITE_PROD: boolean;
      VITE_SSR: boolean;
      VITE_MODE: string;
      VITE_PUBLIC_ORIGIN: string;
    }
  }
}
export {};
