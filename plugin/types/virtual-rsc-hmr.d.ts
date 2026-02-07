declare module 'virtual:react-server/hmr' {
  export const RSC_HMR_EVENT: string;

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
