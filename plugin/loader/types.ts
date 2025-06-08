import type { Program as AcornProgram, Statement, Node as AcornNode } from "acorn";

// Directive is a special type in Acorn that extends ExpressionStatement
export type Directive = Statement & {
  directive: string;
};

export type Node = AcornNode;

export type ExportInfo = {
  name: string;
  localName?: string;
  type: "function" | "variable" | "class" | "unknown";
  isServerAction?: boolean;
  node?: Node;
}

export type Program = AcornProgram & {
  comments?: Array<{
    type: 'Block' | 'Line';
    value: string;
    start: number;
    end: number;
  }>;
};