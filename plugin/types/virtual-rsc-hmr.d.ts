interface RscHmrData {
  file: string;
  path: string;
}

// Augment Vite's CustomEventMap so hot.on()/hot.send() are typed
// See: https://vite.dev/guide/api-plugin#typescript-for-custom-events
declare module 'vite/types/customEvent' {
  interface CustomEventMap {
    'vite-plugin-react-server:server-component-update': RscHmrData;
  }
}

declare module 'virtual:react-server/hmr' {
  export const RSC_HMR_EVENT: 'vite-plugin-react-server:server-component-update';

  export interface RscHmrData {
    file: string;
    path: string;
  }

  export function useRscHmr(
    refetch: (url: string) => void,
    options?: {
      verbose?: boolean;
      filter?: (data: RscHmrData) => boolean;
    }
  ): void;

  export function setupRscHmr(options?: {
    onUpdate?: ((data: RscHmrData) => void | Promise<void>) | 'reload';
    verbose?: boolean;
  }): void;
}
