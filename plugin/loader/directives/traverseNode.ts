import type { Node } from "acorn";

type NodeWithChildren = {
  [key: string]: Node | Node[] | undefined;
};

export function traverseNode(node: Node, callback: (node: Node) => void): void {
  callback(node);

  // Recursively check children
  const nodeWithChildren = node as unknown as NodeWithChildren;
  for (const key in nodeWithChildren) {
    const value = nodeWithChildren[key];
    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object') {
            traverseNode(child, callback);
          }
        }
      } else {
        traverseNode(value as Node, callback);
      }
    }
  }
} 