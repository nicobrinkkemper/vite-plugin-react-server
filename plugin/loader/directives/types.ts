import type {
  Node as AcornNode,
  Program as AcornProgram,
  ArrowFunctionExpression,
  Comment,
  FunctionDeclaration,
  FunctionExpression,
  MethodDefinition,
  Property,
} from "acorn";

// Extend acorn's Node type to always include parent
declare module "acorn" {
  interface Node {
    parent?: Node;
  }
}

export type FunctionNode = FunctionDeclaration | FunctionExpression | ArrowFunctionExpression | MethodDefinition | Property;
export type Program = AcornProgram & {
  comments?: Comment[];
};

export type DirectiveType = "client" | "server";

export type DirectiveRange = [number, number];

export type DirectiveWarning = {
  message: string;
  range: DirectiveRange;
  type: DirectiveType;
};

export type FunctionLevelDirectiveMatch = {
  type: "server";
  range: [number, number];
  name: string;
  exportName: string;
  message?: string;
}

export type FileLevelDirectiveMatch = {
  type: "client" | "server";
  range: [number, number];
  name?: never;
  exportName?: never;
  message?: string;
}

export type DirectiveMatch = FunctionLevelDirectiveMatch | FileLevelDirectiveMatch;

export type DirectiveMatches = {
  matches: DirectiveMatch[];
  warnings: DirectiveWarning[];
};

export type FileLevelDirective = {
  type: DirectiveType;
  range: DirectiveRange;
};

export interface FunctionLevelServerDirective {
  name: string;
  exportName?: string;
  range: [number, number];
  warning?: DirectiveWarning;
}

export type DirectiveInfo = {
  fileLevel: DirectiveMatch | null;
  functionLevel: FunctionLevelDirectiveMatch[];
  warnings: DirectiveWarning[];
};

export interface ExportInfo {
  type: "function" | "class" | "variable" | null;
  localName: string;
  source?: {
    value: string;
  };
  exportName: string;
  isAsync?: boolean;
  range: DirectiveRange;
  loc?: { line: number; column: number } | null | undefined;
}

export type ParsedExports = {
  exportNames: string[];
  exports: Map<string, ExportInfo>;
};

export type ParseResult = 
  | { 
      type: 'success'; 
      directiveInfo: DirectiveInfo; 
      exports: ParsedExports;
      ast: Program;
      code: string;
      map?: {
        url: string;
        start: number;
        end: number;
        lines: number;
      } | null;
    }
  | { type: 'error'; error: Error; directiveInfo?: never; ast?: never; code?: never; map?: never; exports?: never }
  | { type: 'skip'; error?: never; directiveInfo?: never; ast?: never; code?: never; map?: never; exports?: never };

export type FunctionInfo = {
  name: string;
  exportName?: string;
  range: [number, number];
  warning?: DirectiveWarning;
};

export type Node = AcornNode;

export type DirectiveLocation = {
  name: string;
  type: "file" | "function";
  exportName: string;
  range: [number, number];
};
