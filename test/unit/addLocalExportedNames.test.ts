import { describe, it, expect } from 'vitest';
import { addLocalExportedNames } from 'vite-plugin-react-server/directives';
import type { ExportInfo } from 'vite-plugin-react-server/directives';

describe('addLocalExportedNames', () => {
  it('should add local exported names from an Identifier node', () => {
    const node = {
      type: 'Identifier',
      name: 'testFunction'
    } as any;
    
    const exportInfos: ExportInfo[] = [];
    const range: [number, number] = [0, 10];
    
    addLocalExportedNames(exportInfos, node, range);
    
    expect(exportInfos).toHaveLength(1);
    expect(exportInfos[0].localName).toBe('testFunction');
    expect(exportInfos[0].exportName).toBe('testFunction');
    expect(exportInfos[0].range).toEqual([0, 10]);
  });

  it('should add local exported names from a ClassDeclaration node', () => {
    const node = {
      type: 'ClassDeclaration',
      id: {
        type: 'Identifier',
        name: 'TestClass'
      }
    } as any;
    
    const exportInfos: ExportInfo[] = [];
    const range: [number, number] = [0, 20];
    
    addLocalExportedNames(exportInfos, node, range);
    
    expect(exportInfos).toHaveLength(1);
    expect(exportInfos[0].localName).toBe('TestClass');
    expect(exportInfos[0].exportName).toBe('TestClass');
    expect(exportInfos[0].type).toBe('class');
    expect(exportInfos[0].range).toEqual([0, 20]);
  });

  it('should handle nodes gracefully when they have no name', () => {
    const node = {
      type: 'SomeOtherNode'
    } as any;
    
    const exportInfos: ExportInfo[] = [];
    const range: [number, number] = [0, 5];
    
    addLocalExportedNames(exportInfos, node, range);
    
    // Should not add anything for nodes without identifiable names
    expect(exportInfos).toHaveLength(0);
  });
}); 