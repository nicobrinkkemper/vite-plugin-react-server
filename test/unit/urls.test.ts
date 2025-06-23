import { describe, it, expect } from 'vitest';
import { createAbsoluteURL, createBaseURL, createPageURL } from 'vite-plugin-react-server/utils';

//** These utilities are kind of like normalizers and parsers for the baseURL that we initially pass into the plugin
//  This is because when you define the moduleBasePath, it will actually be removed from the stream - which is why we
//  need to respect the initial baseURL setting but `new URL()` won't - so first we use the new URL and then either
//  remove the trailing slash or add it back depending on the initial baseURL setting.
//  */

describe('URL utilities', () => {
  describe('createAbsoluteURL', () => {
    it('should handle root path', () => {
      const absoluteUrl = createAbsoluteURL('/', 'http://localhost:5173');
      expect(absoluteUrl('/test')).toBe('http://localhost:5173/test');
      expect(absoluteUrl('test')).toBe('http://localhost:5173/test');
    });

    it('should handle sub path with trailing slash', () => {
      const absoluteUrl = createAbsoluteURL('/app/', 'http://localhost:5173');
      expect(absoluteUrl('/test')).toBe('http://localhost:5173/app/test');
      expect(absoluteUrl('test')).toBe('http://localhost:5173/app/test');
    });

    it('should handle sub path without trailing slash', () => {
      const absoluteUrl = createAbsoluteURL('/app', 'http://localhost:5173');
      expect(absoluteUrl('/test')).toBe('http://localhost:5173/app/test');
      expect(absoluteUrl('test')).toBe('http://localhost:5173/app/test');
    });

    it('should handle empty base URL', () => {
      const absoluteUrl = createAbsoluteURL('', 'http://localhost:5173');
      expect(absoluteUrl('/test')).toBe('http://localhost:5173/test');
      expect(absoluteUrl('test')).toBe('http://localhost:5173/test');
    });
    it('should handle base with no slashes', () => {
      const absoluteUrl = createAbsoluteURL('app', 'http://localhost:5173');
      expect(absoluteUrl('/test')).toBe('http://localhost:5173/app/test');
      expect(absoluteUrl('test')).toBe('http://localhost:5173/app/test');
    });

    it('should handle invalid public origin', () => {
      const absoluteUrl = createAbsoluteURL('/', 'invalid-url');
      expect(absoluteUrl('/test')).toBe('invalid-url/test');
    });
  });

  describe('createBaseURL', () => {
    it('should handle root path', () => {
      const baseURL = createBaseURL('/');
      expect(baseURL('/test')).toBe('/test');
      expect(baseURL('test')).toBe('/test');
    });

    it('should handle sub path with trailing slash', () => {
      const baseURL = createBaseURL('/app/');
      expect(baseURL('/test')).toBe('/app/test');
      expect(baseURL('test')).toBe('/app/test');
    });

    it('should handle sub path without trailing slash', () => {
      const baseURL = createBaseURL('/app');
      expect(baseURL('/test')).toBe('/app/test');
      expect(baseURL('test')).toBe('/app/test');
    });

    it('should handle empty base URL', () => {
      const baseURL = createBaseURL('');
      expect(baseURL('/test')).toBe('/test');
      expect(baseURL('test')).toBe('test'); // Empty base URL should not add leading slash
    });
  });

  describe('createPageURL', () => {
    it('should handle root path', () => {
      const pageURL = createPageURL('/', 'http://localhost:5173');
      const result = pageURL('/test');
      expect(result.indexRSC).toBe('http://localhost:5173/test/index.rsc');
      expect(result.moduleBaseURL).toBe('http://localhost:5173/');
    });

    it('should handle sub path with trailing slash', () => {
      const pageURL = createPageURL('/app/', 'http://localhost:5173');
      const result = pageURL('/test');
      expect(result.indexRSC).toBe('http://localhost:5173/app/test/index.rsc');
      expect(result.moduleBaseURL).toBe('http://localhost:5173/app/'); // not the trailing slash is UNLIKE createAbsoluteURL
    });

    it('should handle sub path without trailing slash', () => {
      const pageURL = createPageURL('/app', 'http://localhost:5173');
      const result = pageURL('/test');
      expect(result.indexRSC).toBe('http://localhost:5173/app/test/index.rsc');
      expect(result.moduleBaseURL).toBe('http://localhost:5173/app');
    });

    it('should handle empty base URL', () => {
      const pageURL = createPageURL('', 'http://localhost:5173');
      const result = pageURL('/test');
      expect(result.indexRSC).toBe('http://localhost:5173/test/index.rsc');
      expect(result.moduleBaseURL).toBe('http://localhost:5173');
    });

    it('should handle invalid public origin', () => {
      const pageURL = createPageURL('/', 'IGNORE_THIS_ERROR');
      const result = pageURL('/test');
      expect(result.indexRSC).toBe('/index.rsc');
      expect(result.moduleBaseURL).toBe('/');
    });

    it('should preserve exact baseURL without trailing slash', () => {
      const pageURL = createPageURL('/app', 'http://localhost:5173');
      const result = pageURL('/test');
      expect(result.moduleBaseURL).toBe('http://localhost:5173/app');
      expect(result.indexRSC).toBe('http://localhost:5173/app/test/index.rsc');
    });

    it('should preserve exact baseURL with trailing slash', () => {
      const pageURL = createPageURL('/app/', 'http://localhost:5173');
      const result = pageURL('/test');
      expect(result.moduleBaseURL).toBe('http://localhost:5173/app/');
      expect(result.indexRSC).toBe('http://localhost:5173/app/test/index.rsc');
    });

    it('should preserve exact baseURL with no slashes', () => {
      const pageURL = createPageURL('app', 'http://localhost:5173');
      const result = pageURL('/test');
      expect(result.moduleBaseURL).toBe('http://localhost:5173/app');
      expect(result.indexRSC).toBe('http://localhost:5173/app/test/index.rsc');
    });

    it('should preserve exact baseURL with empty string', () => {
      const pageURL = createPageURL('', 'http://localhost:5173');
      const result = pageURL('/test');
      expect(result.moduleBaseURL).toBe('http://localhost:5173');
    });

    it('should preserve exact baseURL with root path', () => {
      const pageURL = createPageURL('/', 'http://localhost:5173');
      const result = pageURL('/test');
      expect(result.moduleBaseURL).toBe('http://localhost:5173/');
    });

    it('should preserve exact baseURL with multiple slashes', () => {
      const pageURL = createPageURL('/app///', 'http://localhost:5173');
      const result = pageURL('/test');
      expect(result.moduleBaseURL).toBe('http://localhost:5173/app///');
    });

    it('should preserve exact baseURL with no leading slash', () => {
      const pageURL = createPageURL('app/', 'http://localhost:5173');
      const result = pageURL('/test');
      expect(result.moduleBaseURL).toBe('http://localhost:5173/app/');
    });

    it('should preserve exact baseURL with just a slash', () => {
      const pageURL = createPageURL('/', 'http://localhost:5173');
      const result = pageURL('/test');
      expect(result.moduleBaseURL).toBe('http://localhost:5173/');
    });
  });
}); 