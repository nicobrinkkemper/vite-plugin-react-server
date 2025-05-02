// /**
//  * css-stream-tracker.ts
//  * 
//  * PURPOSE: Track CSS class usage during RSC streaming
//  * 
//  * This module provides a proxy-based system to track CSS class usage
//  * during React Server Component streaming, allowing for:
//  * 1. Real-time tracking of which CSS classes are used during streaming
//  * 2. Collection of used classes for each route
//  * 3. Integration with the existing CSS tracking system
//  */

// import { createCssModuleProxy, trackCssClass, getUsedCssClasses, resetUsedCssClasses } from './css-class-tracker.js';

// // Track CSS class usage per route during streaming
// const streamUsedClasses = new Map<string, Set<string>>();

// // Track CSS files per route during streaming
// const streamCssFiles = new Map<string, Set<string>>();

// // Current route being streamed
// let currentStreamRoute: string | null = null;

// /**
//  * Set the current route for CSS class tracking during streaming
//  */
// export function setCurrentStreamRoute(route: string | null) {
//   currentStreamRoute = route;
  
//   // Initialize tracking for this route if needed
//   if (route && !streamUsedClasses.has(route)) {
//     streamUsedClasses.set(route, new Set<string>());
//     streamCssFiles.set(route, new Set<string>());
//   }
// }

// /**
//  * Track a CSS class as being used during streaming
//  */
// export function trackStreamCssClass(className: string) {
//   // Track in the global tracker
//   trackCssClass(className);
  
//   // Track in the route-specific tracker
//   if (currentStreamRoute) {
//     const routeClasses = streamUsedClasses.get(currentStreamRoute);
//     if (routeClasses) {
//       routeClasses.add(className);
//     }
//   }
// }

// /**
//  * Track a CSS file as being used during streaming
//  */
// export function trackStreamCssFile(cssFile: string) {
//   if (currentStreamRoute) {
//     const routeFiles = streamCssFiles.get(currentStreamRoute);
//     if (routeFiles) {
//       routeFiles.add(cssFile);
//     }
//   }
// }

// /**
//  * Get all tracked CSS classes for a specific route during streaming
//  */
// export function getStreamUsedCssClasses(route: string): string[] {
//   const routeClasses = streamUsedClasses.get(route);
//   return routeClasses ? Array.from(routeClasses) : [];
// }

// /**
//  * Get all tracked CSS files for a specific route during streaming
//  */
// export function getStreamCssFiles(route: string): string[] {
//   const routeFiles = streamCssFiles.get(route);
//   return routeFiles ? Array.from(routeFiles) : [];
// }

// /**
//  * Reset tracked CSS classes for a specific route
//  */
// export function resetStreamCssClasses(route: string) {
//   if (streamUsedClasses.has(route)) {
//     streamUsedClasses.set(route, new Set<string>());
//   }
//   if (streamCssFiles.has(route)) {
//     streamCssFiles.set(route, new Set<string>());
//   }
// }

// /**
//  * Reset all tracked CSS classes and files
//  */
// export function resetAllStreamCssTracking() {
//   streamUsedClasses.clear();
//   streamCssFiles.clear();
//   resetUsedCssClasses();
// }

// /**
//  * Create a streaming-aware proxy for CSS modules to track class usage
//  */
// export function createStreamCssModuleProxy(classes: Record<string, string>, moduleId?: string) {
//   return new Proxy(classes, {
//     get(target, prop) {
//       if (typeof prop === 'string' && prop in target) {
//         const className = target[prop];
//         // Track in both the global and stream-specific trackers
//         trackStreamCssClass(className);
        
//         // Emit CSS class usage event if we have a current route
//         if (currentStreamRoute && typeof globalThis !== 'undefined' && 'onEvent' in globalThis) {
//           const onEvent = (globalThis as any).onEvent;
//           if (typeof onEvent === 'function') {
//             onEvent({
//               type: 'css.class.used',
//               data: {
//                 route: currentStreamRoute,
//                 className,
//                 moduleId: moduleId || 'unknown'
//               }
//             });
//           }
//         }
        
//         return className;
//       }
//       return undefined;
//     }
//   });
// }

// /**
//  * Create a streaming-aware CSS content object with proxy for tracking class usage
//  */
// export function createStreamCssContent(
//   path: string, 
//   id: string, 
//   classes: Record<string, string>,
//   cssContent?: string
// ) {
//   // Create proxied classes object for tracking usage during streaming
//   const proxiedClasses = createStreamCssModuleProxy(classes, id);
  
//   // Track this CSS file for the current route
//   if (currentStreamRoute) {
//     trackStreamCssFile(path);
//   }
  
//   // Create CSS content with proxy for tracking class usage
//   return {
//     type: 'text/css',
//     key: path,
//     path,
//     id,
//     isUsed: true,
//     proxy: {
//       isUsed: true,
//       id,
//       module: proxiedClasses,
//       usedClasses: Object.keys(classes), // Include all classes initially
//       content: cssContent // Include CSS content if provided
//     }
//   };
// }

// /**
//  * Get a summary of CSS usage for a specific route
//  */
// export function getStreamCssSummary(route: string) {
//   return {
//     route,
//     cssFiles: getStreamCssFiles(route),
//     usedClasses: getStreamUsedCssClasses(route)
//   };
// } 