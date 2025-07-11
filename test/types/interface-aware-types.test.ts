import { describe, it, expectTypeOf } from "vitest";
import type {
  CoreInterface,
  DefaultInterface,
  InterfaceAwareCssContent,
  InterfaceAwareRootOptions,
  InterfaceAwareCssComponentType,
  InterfaceAwareCssProps,
  InterfaceAwareHandlerAssets,
  InterfaceAwareCreateHandlerResult,
  InterfaceAwareBuildModuleLoader,
  CreateHandlerOptions,
} from "vite-plugin-react-server/types";

// Custom interface for testing
interface CustomInterface extends CoreInterface {
  PageProps: { title: string; count: number };
  As: "div" | "section" | "article";
  InlineCSS: true; // Always inline CSS
  ReactType: React.ReactElement;
  PropsExportName: "pageProps";
  PageExportName: "PageComponent";
  RootExportName: "RootComponent";
  HtmlExportName: "HtmlComponent";
}

describe("Interface-Aware Types", () => {
  describe("Type definitions", () => {
    it("should define interface-aware CSS content type", () => {
      type Test = InterfaceAwareCssContent<CustomInterface>;
      expectTypeOf<Test>().not.toBeNever();
    });

    it("should define interface-aware root options type", () => {
      type Test = InterfaceAwareRootOptions<CustomInterface>;
      expectTypeOf<Test>().not.toBeNever();
    });

    it("should define interface-aware CSS component type", () => {
      type Test = InterfaceAwareCssComponentType<CustomInterface>;
      expectTypeOf<Test>().not.toBeNever();
    });

    it("should define interface-aware CSS props type", () => {
      type Test = InterfaceAwareCssProps<CustomInterface>;
      expectTypeOf<Test>().not.toBeNever();
    });

    it("should define interface-aware handler assets type", () => {
      type Test = InterfaceAwareHandlerAssets<CustomInterface>;
      expectTypeOf<Test>().not.toBeNever();
    });

    it("should define interface-aware create handler result type", () => {
      type Test = InterfaceAwareCreateHandlerResult<CustomInterface>;
      expectTypeOf<Test>().not.toBeNever();
    });

    it("should define interface-aware build module loader type", () => {
      type Test = InterfaceAwareBuildModuleLoader<CustomInterface>;
      expectTypeOf<Test>().not.toBeNever();
    });
  });

  describe("CreateHandlerOptions", () => {
    it("should accept custom interface parameter", () => {
      type Test = CreateHandlerOptions<any, CustomInterface>;
      expectTypeOf<Test>().not.toBeNever();
    });
  });

  describe("Default interface compatibility", () => {
    it("should work with default interface", () => {
      type Test1 = InterfaceAwareCssContent<DefaultInterface>;
      type Test2 = InterfaceAwareRootOptions<DefaultInterface>;
      type Test3 = InterfaceAwareCssComponentType<DefaultInterface>;
      type Test4 = InterfaceAwareCssProps<DefaultInterface>;
      type Test5 = InterfaceAwareHandlerAssets<DefaultInterface>;
      type Test6 = InterfaceAwareCreateHandlerResult<DefaultInterface>;
      type Test7 = InterfaceAwareBuildModuleLoader<DefaultInterface>;
      
      expectTypeOf<Test1>().not.toBeNever();
      expectTypeOf<Test2>().not.toBeNever();
      expectTypeOf<Test3>().not.toBeNever();
      expectTypeOf<Test4>().not.toBeNever();
      expectTypeOf<Test5>().not.toBeNever();
      expectTypeOf<Test6>().not.toBeNever();
      expectTypeOf<Test7>().not.toBeNever();
    });
  });
}); 