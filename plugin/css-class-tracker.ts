/**
 * css-class-tracker.ts
 * 
 * PURPOSE: Track CSS class usage during RSC rendering
 */

// Track CSS class usage
const usedClasses = new Set<string>();

// Store the current route for event emission
let currentRoute: string | null = null;

// Store CSS files for the current route
const cssFilesByRoute = new Map<string, Set<string>>();

// Store purgeCss setting
let purgeCssEnabled = false;

/**
 * Set the current route for CSS class tracking
 */
export function setCurrentRoute(route: string | null) {
  currentRoute = route;
  
  // Initialize CSS files tracking for this route if needed
  if (route && !cssFilesByRoute.has(route)) {
    cssFilesByRoute.set(route, new Set<string>());
  }
}

/**
 * Set the purgeCss setting
 */
export function setPurgeCssEnabled(enabled: boolean) {
  purgeCssEnabled = enabled;
}

/**
 * Get the current purgeCss setting
 */
export function isPurgeCssEnabled(): boolean {
  return purgeCssEnabled;
}

/**
 * Track a CSS class as being used during RSC rendering
 */
export function trackCssClass(className: string) {
  usedClasses.add(className);
}

/**
 * Get all tracked CSS classes from the current render
 */
export function getUsedCssClasses(): string[] {
  console.log("usedClasses", usedClasses);
  return Array.from(usedClasses);
}

/**
 * Reset tracked CSS classes before a new render
 */
export function resetUsedCssClasses() {
  usedClasses.clear();
}

/**
 * Track a CSS file for the current route
 */
export function trackCssFile(cssFile: string) {
  if (currentRoute) {
    const routeFiles = cssFilesByRoute.get(currentRoute);
    if (routeFiles) {
      routeFiles.add(cssFile);
    }
  }
}

/**
 * Get all tracked CSS files for the current route
 */
export function getTrackedCssFiles(): string[] {
  if (!currentRoute) return [];
  const routeFiles = cssFilesByRoute.get(currentRoute);
  return routeFiles ? Array.from(routeFiles) : [];
}

/**
 * Create a proxy for CSS modules to track class usage
 */
export function createCssModuleProxy(classes: Record<string, string>, moduleId?: string) {
  // Always create a proxy to track class usage, regardless of purgeCss setting
  return new Proxy(classes, {
    get(target, prop) {
      console.log("get", prop, target);
      if (typeof prop === 'string' && prop in target) {
        const className = target[prop];
        trackCssClass(className);
        
        // Emit CSS class usage event if we have a current route
        if (currentRoute && typeof globalThis !== 'undefined' && 'onEvent' in globalThis) {
          const onEvent = (globalThis as any).onEvent;
          if (typeof onEvent === 'function') {
            // Emit css.class.used event for individual class usage
            onEvent({
              type: 'css.class.used',
              data: {
                route: currentRoute,
                className,
                moduleId: moduleId || 'unknown'
              }
            });
          }
        }
        
        return className;
      }
      return undefined;
    }
  });
}

// Track CSS module usage through import.meta.cssModules
export function trackCssModuleUsage(moduleId: string) {
  if (typeof import.meta !== 'undefined' && import.meta.cssModules) {
    const styles = import.meta.cssModules[moduleId];
    if (styles) {
      // Create a proxy to track class usage
      const proxiedStyles = createCssModuleProxy(styles, moduleId);
      import.meta.cssModules[moduleId] = proxiedStyles;
    }
  }
}

// Reset CSS module tracking
export function resetCssModuleTracking() {
  if (typeof import.meta !== 'undefined' && import.meta.cssModules) {
    Object.keys(import.meta.cssModules).forEach(moduleId => {
      const styles = import.meta?.cssModules?.[moduleId];
      if (styles && import.meta.cssModules) {
        // Reset the proxy to track class usage
        const proxiedStyles = createCssModuleProxy(styles, moduleId);
        import.meta.cssModules[moduleId] = proxiedStyles;
      }
    });
  }
} 