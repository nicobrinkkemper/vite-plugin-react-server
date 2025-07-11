import { describe, it, expectTypeOf } from 'vitest';
import React from 'react';
import type {
  CoreInterface,
  DefaultInterface,
  PageComponentType,
  RootComponentType,
  PagePropOpt,
  AsOpt,
  InlineCssOpt,
} from 'vite-plugin-react-server/types';

// Test the default interface types
describe('DefaultInterface', () => {
  it('should have correct default types', () => {
    expectTypeOf<DefaultInterface['PageProps']>().toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf<DefaultInterface['As']>().toEqualTypeOf<AsOpt>();
    expectTypeOf<DefaultInterface['InlineCSS']>().toEqualTypeOf<InlineCssOpt>();
    expectTypeOf<DefaultInterface['ReactType']>().toEqualTypeOf<React.ReactNode>();
  });
});

// Test custom interface
interface CustomInterface extends CoreInterface {
  PageProps: { userId: string; theme: 'light' | 'dark' };
  As: 'div' | 'section' | 'main';
  InlineCSS: true; // Only allow inline CSS
  ReactType: React.ReactNode;
}

describe('CustomInterface', () => {
  it('should have custom types', () => {
    expectTypeOf<CustomInterface['PageProps']>().toEqualTypeOf<{ userId: string; theme: 'light' | 'dark' }>();
    expectTypeOf<CustomInterface['As']>().toEqualTypeOf<'div' | 'section' | 'main'>();
    expectTypeOf<CustomInterface['InlineCSS']>().toEqualTypeOf<true>();
    expectTypeOf<CustomInterface['ReactType']>().toEqualTypeOf<React.ReactNode>();
  });
});

// Test component types with custom interface
describe('ComponentTypes with CustomInterface', () => {
  it('should use custom interface for PageComponentType', () => {
    type CustomPageComponent = PageComponentType<CustomInterface['PageProps'], CustomInterface['ReactType']>;
    const testComponent: CustomPageComponent = (props) => React.createElement('div');
    expectTypeOf(testComponent).toEqualTypeOf<
      (props: { userId: string; theme: 'light' | 'dark' }) => React.ReactNode
    >();
  });

  it('should use custom interface for RootComponentType', () => {
    type CustomRootComponent = RootComponentType<
      CustomInterface['PageProps'],
      CustomInterface['As'],
      CustomInterface['InlineCSS'],
      CustomInterface['ReactType']
    >;
    const testComponent: CustomRootComponent = (props) => React.createElement('div');
    expectTypeOf(testComponent).toEqualTypeOf<
      (props: {
        as: 'div' | 'section' | 'main';
        cssFiles?: Map<string, any>;
        pageProps?: { userId: string; theme: 'light' | 'dark' };
        Page: (props: { userId: string; theme: 'light' | 'dark' }) => React.ReactNode;
        id?: string;
      }) => React.ReactNode
    >(undefined as never);
  });
});

// Test backward compatibility
describe('Backward Compatibility', () => {
  it('should maintain legacy type aliases', () => {
    expectTypeOf<PagePropOpt>().toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf<AsOpt>().toEqualTypeOf<React.ExoticComponent<React.FragmentProps> | Exclude<keyof React.JSX.IntrinsicElements, "symbol" | "object">>();
    expectTypeOf<InlineCssOpt>().toEqualTypeOf<undefined | boolean>();
  });

  it('should work with default interface when no interface is specified', () => {
    type DefaultPageComponent = PageComponentType<PagePropOpt, any>;
    const testComponent: DefaultPageComponent = (props) => React.createElement('div');
    expectTypeOf(testComponent).toEqualTypeOf<
      (props: Record<string, unknown>) => any
    >();
  });
});

// Test practical usage
describe('Practical Usage', () => {
  it('should work with a realistic custom interface', () => {
    interface AppInterface extends CoreInterface {
      PageProps: {
        user: { id: string; name: string };
        settings: { theme: string; language: string };
      };
      As: 'div' | 'main' | 'article';
      InlineCSS: false;
      ReactType: React.ReactNode;
    }

    type AppPageComponent = PageComponentType<AppInterface['PageProps'], AppInterface['ReactType']>;
    type AppRootComponent = RootComponentType<
      AppInterface['PageProps'],
      AppInterface['As'],
      AppInterface['InlineCSS'],
      AppInterface['ReactType']
    >;

    // Test that the types are correctly inferred
    const testPageComponent: AppPageComponent = (props) => React.createElement('div');
    expectTypeOf(testPageComponent).toEqualTypeOf<
      (props: {
        user: { id: string; name: string };
        settings: { theme: string; language: string };
      }) => React.ReactNode
    >();

    const testRootComponent: AppRootComponent = (props) => React.createElement('div');
    expectTypeOf(testRootComponent).toEqualTypeOf<
      (props: {
        as: 'div' | 'main' | 'article';
        cssFiles?: Map<string, any>;
        pageProps?: {
          user: { id: string; name: string };
          settings: { theme: string; language: string };
        };
        Page: (props: {
          user: { id: string; name: string };
          settings: { theme: string; language: string };
        }) => React.ReactNode;
        id?: string;
      }) => React.ReactNode
    >(undefined as never);
  });
}); 