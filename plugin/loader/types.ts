import type { Program as AcornProgram, Statement } from "acorn";

// Directive is a special type in Acorn that extends ExpressionStatement
export type Directive = Statement & {
  directive: string;
};

export interface Program extends AcornProgram {
  exports?: string[];
}