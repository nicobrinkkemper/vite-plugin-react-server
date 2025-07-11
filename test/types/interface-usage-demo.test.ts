import { describe, it, expectTypeOf } from "vitest";
import type {
  CoreInterface,
  StreamPluginOptions,
  InterfaceAwareCssContent,
  InterfaceAwareRootOptions,
  InterfaceAwareCssComponentType,
  InterfaceAwareCssProps,
  InterfaceAwareHandlerAssets,
  InterfaceAwareCreateHandlerResult,
  InterfaceAwareBuildModuleLoader,
  LinkCssProps,
  StyleCssProps,
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
interface CustomInterfaceInlineCSSfalse
  extends Omit<CustomInterface, "InlineCSS"> {
  InlineCSS: false; // Always inline CSS
}
interface CustomInterfaceInlineCSSundefined
  extends Omit<CustomInterface, "InlineCSS"> {
  InlineCSS: undefined; // Always inline CSS
}

describe("Interface-Aware Type Usage Demo", () => {
  it("should provide interface-aware type aliases", () => {
    // Interface-aware type aliases for better type safety
    type Test1 = InterfaceAwareCssContent<CustomInterface>;
    type Test2 = InterfaceAwareRootOptions<CustomInterface>;
    type Test3 = InterfaceAwareCssComponentType<CustomInterface>;
    type Test4 = InterfaceAwareCssProps<CustomInterface>;
    type Test5 = InterfaceAwareHandlerAssets<CustomInterface>;
    type Test6 = InterfaceAwareCreateHandlerResult<CustomInterface>;
    type Test7 = InterfaceAwareBuildModuleLoader<CustomInterface>;
    type Test8 = InterfaceAwareCssProps<CustomInterfaceInlineCSSfalse>;
    type Test9 = InterfaceAwareCssProps<CustomInterfaceInlineCSSundefined>;

    // Simple assertion to verify the types work
    expectTypeOf<Test1>().toExtend<{ as: string }>();
    expectTypeOf<Test2>().toExtend<{ inlineCss?: boolean }>();
    expectTypeOf<Test3>().toExtend<(props: any) => any>();
    expectTypeOf<Test4>().toExtend<{ cssFiles: Map<string, StyleCssProps> }>();
    expectTypeOf<Test5>().toExtend<{
      css: any[];
      js: string[];
      bootstrapModules: string[];
    }>();
    expectTypeOf<Test6>().toExtend<{ type: string }>();
    expectTypeOf<Test7>().toExtend<(moduleId: string) => Promise<any>>();
    expectTypeOf<Test8>().toExtend<{ cssFiles: Map<string, LinkCssProps> }>();
    expectTypeOf<Test9>().toExtend<{ cssFiles: Map<string, LinkCssProps | StyleCssProps> }>();
  });

  it("should use interface-aware types correctly", () => {
    const options: StreamPluginOptions<CustomInterface> = {
      moduleBase: "src",
      pageExportName: "PageComponent",
      propsExportName: "pageProps",
      rootExportName: "RootComponent",
      htmlExportName: "HtmlComponent",
      css: {
        inlineCss: undefined,
      },
    };

    expectTypeOf(options.pageExportName).toExtend<
      "PageComponent" | undefined
    >();
    expectTypeOf(options.propsExportName).toExtend<"pageProps" | undefined>();
    expectTypeOf(options.css?.inlineCss).toExtend<true | undefined>();
  });
});
