import type { Node, Program, ExpressionStatement, FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, VariableDeclarator, MethodDefinition } from 'acorn';

type NodeWithParent = Node & {
  parent?: Node;
};

type DirectiveNode = ExpressionStatement & { 
  directive: string;
  parent?: Node;
};

export interface DirectiveInfo {
  useClient: boolean;
  useServer: boolean;
  directiveRanges: Array<{ start: number; end: number; directive: string }>;
  fileLevelServerDirective?: { start: number; end: number };
  fileLevelClientDirective?: { start: number; end: number };
  functionLevelServerDirectives: Array<{ start: number; end: number; name: string }>;
  functionLevelClientDirectives: Array<{ start: number; end: number; name: string }>;
  customDirectiveRanges: Array<{ name: string; ranges: Array<{ start: number; end: number }> }>;
  directiveContext: {
    isFileLevel: boolean;
    isFunctionLevel: boolean;
    functionLevelServerDirectives: Array<{ start: number; end: number; name: string }>;
    functionLevelClientDirectives: Array<{ start: number; end: number; name: string }>;
    customDirectiveRanges: Array<{ name: string; ranges: Array<{ start: number; end: number }> }>;
  };
}

export interface DirectiveConfig {
  clientDirective?: string;
  serverDirective?: string;
  customDirectives?: Array<{
    name: string;
    validate?: (node: Node) => boolean;
  }>;
  validateFileLevel?: (node: Node, index: number, program: Program) => boolean;
}


function isFunctionDeclaration(node: Node): node is FunctionDeclaration & NodeWithParent {
  return node.type === 'FunctionDeclaration';
}

function isFunctionExpression(node: Node): node is FunctionExpression & NodeWithParent {
  return node.type === 'FunctionExpression';
}

function isArrowFunctionExpression(node: Node): node is ArrowFunctionExpression & NodeWithParent {
  return node.type === 'ArrowFunctionExpression';
}

function getDirectiveScope(node: NodeWithParent): { type: 'file' | 'function'; name?: string } {
  let current = node;
  while (current.parent) {
    if (isFunctionDeclaration(current.parent)) {
      return { type: 'function', name: current.parent.id?.name };
    }
    if (isFunctionExpression(current.parent) || isArrowFunctionExpression(current.parent)) {
      // Check if this function is assigned to a variable
      const maybeVarDecl = current.parent.parent;
      if (maybeVarDecl && maybeVarDecl.type === 'VariableDeclarator') {
        const varDecl = maybeVarDecl as VariableDeclarator & NodeWithParent;
        if('name' in varDecl.id) {
          console.log('TYPE HERE', varDecl.id.type)
          return { type: 'function', name: varDecl.id.name };
        } else {
          console.log('NO NAME!!', varDecl.id.type)
          return { type: 'function' };
        }
      }
      // Check if this function is a class method
      if (current.parent.parent && current.parent.parent.type === 'MethodDefinition') {
        const method = current.parent.parent as MethodDefinition;
        const keyName = typeof method.key === 'object' && 'name' in method.key ? method.key.name : undefined;
        return { type: 'function', name: keyName };
      }
      return { type: 'function' };
    }
    // NEW: Check for class method (MethodDefinition)
    if (current.parent.type === 'MethodDefinition') {
      const method = current.parent as MethodDefinition;
      const keyName = typeof method.key === 'object' && 'name' in method.key ? method.key.name : undefined;
      return { type: 'function', name: keyName };
    }
    current = current.parent;
  }
  return { type: 'file' };
}

export function findDirectives(program: Program, source: string): DirectiveInfo {
  const directiveInfo: DirectiveInfo = {
    useClient: false,
    useServer: false,
    directiveRanges: [],
    fileLevelServerDirective: undefined,
    fileLevelClientDirective: undefined,
    functionLevelServerDirectives: [],
    functionLevelClientDirectives: [],
    customDirectiveRanges: [],
    directiveContext: {
      isFileLevel: true,
      isFunctionLevel: false,
      functionLevelServerDirectives: [],
      functionLevelClientDirectives: [],
      customDirectiveRanges: []
    }
  };

  function visit(node: NodeWithParent, parent?: NodeWithParent): void {
    node.parent = parent;
    if (node.type === 'ExpressionStatement' && 'directive' in node) {
      const directiveNode = node as DirectiveNode;
      const scope = getDirectiveScope(directiveNode);
      if (directiveNode.directive === 'use server') {
        if (scope.type === 'file') {
          // Only set file-level if not inside any function
          if (!directiveInfo.fileLevelServerDirective) {
            directiveInfo.fileLevelServerDirective = { start: directiveNode.start!, end: directiveNode.end! };
            directiveInfo.useServer = true;
          }
        } else {
          directiveInfo.functionLevelServerDirectives.push({
            name: scope.name || 'anonymous',
            start: directiveNode.start!,
            end: directiveNode.end!
          });
          directiveInfo.directiveContext.functionLevelServerDirectives.push({
            name: scope.name || 'anonymous',
            start: directiveNode.start!,
            end: directiveNode.end!
          });
          directiveInfo.useServer = true;
        }
      } else if (directiveNode.directive === 'use client') {
        if (scope.type === 'file') {
          if (!directiveInfo.fileLevelClientDirective) {
            directiveInfo.fileLevelClientDirective = { start: directiveNode.start!, end: directiveNode.end! };
            directiveInfo.useClient = true;
          }
        } else {
          directiveInfo.functionLevelClientDirectives.push({
            name: scope.name || 'anonymous',
            start: directiveNode.start!,
            end: directiveNode.end!
          });
          directiveInfo.directiveContext.functionLevelClientDirectives.push({
            name: scope.name || 'anonymous',
            start: directiveNode.start!,
            end: directiveNode.end!
          });
          directiveInfo.useClient = true;
        }
      }
      directiveInfo.directiveRanges.push({
        start: directiveNode.start!,
        end: directiveNode.end!,
        directive: directiveNode.directive
      });

      // Check for semicolon and newline in the correct order
      let end = directiveNode.end!;
      if (end < source.length) {
        // Check for semicolon
        if (source.slice(end, end + 1) === ';') {
          end++;
        }
        // Then check for newline
        if (end < source.length && source.slice(end, end + 1) === '\n') {
          end++;
        }
        // Update all directive ranges with the extended end position
        const lastRange = directiveInfo.directiveRanges[directiveInfo.directiveRanges.length - 1];
        if (lastRange) {
          lastRange.end = end;
        }
        if (scope.type === 'function') {
          if (directiveNode.directive === 'use server') {
            const funcDirective = directiveInfo.functionLevelServerDirectives.find(d => d.name === scope.name);
            if (funcDirective) {
              funcDirective.end = end;
            }
          } else if (directiveNode.directive === 'use client') {
            const funcDirective = directiveInfo.functionLevelClientDirectives.find(d => d.name === scope.name);
            if (funcDirective) {
              funcDirective.end = end;
            }
          }
        } else {
          if (directiveNode.directive === 'use server' && directiveInfo.fileLevelServerDirective) {
            directiveInfo.fileLevelServerDirective.end = end;
          } else if (directiveNode.directive === 'use client' && directiveInfo.fileLevelClientDirective) {
            directiveInfo.fileLevelClientDirective.end = end;
          }
        }
      }
    }
    // Visit child nodes
    for (const key in node) {
      if (key === 'parent') continue; // Prevent infinite recursion
      const child = node[key as keyof Node];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          child.forEach(grandChild => {
            if (grandChild && typeof grandChild === 'object') {
              visit(grandChild as NodeWithParent, node);
            }
          });
        } else if (typeof child === 'object' && 'type' in child) {
          visit(child as unknown as NodeWithParent, node);
        }
      }
    }
  }

  visit(program);
  return directiveInfo;
}
