import type { BlockStatement } from "acorn";
import type { DirectiveWarning } from "./types.js";
import { isExpressionStatement, isStringLiteral } from "./typeGuards.js";

type FunctionDirectiveInfo = {
  hasDirective: boolean;
  range: [number, number];
  warning: DirectiveWarning | undefined;
};

export function checkFunctionBody(body: BlockStatement): FunctionDirectiveInfo {
  if (!body || !body.body || body.body.length === 0) {
    return {
      hasDirective: false,
      range: [0, 0],
      warning: undefined
    };
  }

  const firstStatement = body.body[0];
  if (!isExpressionStatement(firstStatement)) {
    return {
      hasDirective: false,
      range: [0, 0],
      warning: undefined
    };
  }

  const expression = firstStatement.expression;
  if (!isStringLiteral(expression)) {
    return {
      hasDirective: false,
      range: [0, 0],
      warning: undefined
    };
  }

  const value = expression.value;
  if (value === "use server") {
    return {
      hasDirective: true,
      range: [expression.start, expression.end],
      warning: undefined
    };
  } else if (value === "use client") {
    return {
      hasDirective: false,
      range: [expression.start, expression.end],
      warning: {
        message: "Directive 'use client' is not allowed at function level. Only 'use server' is allowed at the start of async functions.",
        range: [expression.start, expression.end],
        type: "client"
      }
    };
  }

  // Check for directives after non-directive statements
  for (let i = 1; i < body.body.length; i++) {
    const statement = body.body[i];
    if (isExpressionStatement(statement) && isStringLiteral(statement.expression)) {
      const value = statement.expression.value;
      if (value === "use server" || value === "use client") {
        console.log("Found directive after non-directive:", value);
        return {
          hasDirective: false,
          range: [statement.expression.start, statement.expression.end],
          warning: {
            message: "'use server' directive is only allowed at the top of a file or at the start of an async function",
            range: [statement.expression.start, statement.expression.end],
            type: "server"
          }
        };
      }
    }
  }

  return {
    hasDirective: false,
    range: [0, 0],
    warning: undefined
  };
} 