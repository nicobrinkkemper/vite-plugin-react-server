export type CssTracking = {
  trackCssClass: (className: string) => void;
  getUsedCssClasses: () => Set<string>;
  clearUsedCssClasses: () => void;
} 