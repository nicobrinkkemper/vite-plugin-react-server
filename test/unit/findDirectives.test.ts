import { describe, it, expect } from 'vitest';
import { findDirectives } from '../../plugin/loader/findDirectives.js';
import { parse } from '../../plugin/loader/parse.js';

describe('findDirectives', () => {
  it('should detect file-level client directive', () => {
    const source = '"use client";\nexport function Component() {}';
    const { program } = parse(source);
    const directives = findDirectives(program);

    expect(directives.useClient).toBe(true);
    expect(directives.fileLevelClientDirective).toBeDefined();
    expect(directives.fileLevelClientDirective?.start).toBe(0);
    expect(directives.fileLevelClientDirective?.end).toBe(13);
    expect(directives.functionLevelClientDirectives).toHaveLength(0);
  });

  it('should detect file-level server directive', () => {
    const source = '"use server";\nexport function action() {}';
    const { program } = parse(source);
    const directives = findDirectives(program);

    expect(directives.useServer).toBe(true);
    expect(directives.fileLevelServerDirective).toBeDefined();
    expect(directives.fileLevelServerDirective?.start).toBe(0);
    expect(directives.fileLevelServerDirective?.end).toBe(13);
    expect(directives.functionLevelServerDirectives).toHaveLength(0);
  });

  it('should detect function-level server directive', () => {
    const source = `
      export function action() {
        "use server";
        return true;
      }
    `;
    const { program } = parse(source);
    const directives = findDirectives(program);

    expect(directives.useServer).toBe(true);
    expect(directives.fileLevelServerDirective).toBeUndefined();
    expect(directives.functionLevelServerDirectives).toHaveLength(1);
    expect(directives.functionLevelServerDirectives[0].name).toBe('action');
  });

  it('should detect multiple function-level server directives', () => {
    const source = `
      export function action1() {
        "use server";
        return true;
      }
      export function action2() {
        "use server";
        return false;
      }
    `;
    const { program } = parse(source);
    const directives = findDirectives(program);

    expect(directives.useServer).toBe(true);
    expect(directives.functionLevelServerDirectives).toHaveLength(2);
    expect(directives.functionLevelServerDirectives.map(d => d.name)).toEqual(['action1', 'action2']);
  });

  it('should detect function-level server directive in arrow function', () => {
    const source = `
      export const action = () => {
        "use server";
        return true;
      }
    `;
    const { program } = parse(source);
    const directives = findDirectives(program);

    expect(directives.useServer).toBe(true);
    expect(directives.functionLevelServerDirectives).toHaveLength(1);
    expect(directives.functionLevelServerDirectives[0].name).toBe('action');
  });

  it('should detect function-level server directive in exported variable declaration', () => {
    const source = `
      const action = function() {
        "use server";
        return true;
      }
      export { action };
    `;
    const { program } = parse(source);
    const directives = findDirectives(program);

    expect(directives.useServer).toBe(true);
    expect(directives.functionLevelServerDirectives).toHaveLength(1);
    expect(directives.functionLevelServerDirectives[0].name).toBe('action');
  });

  it('should not detect directives in string literals', () => {
    const source = `
      const str = "use server";
      export function action() {
        return str;
      }
    `;
    const { program } = parse(source);
    const directives = findDirectives(program);

    expect(directives.useServer).toBe(false);
    expect(directives.functionLevelServerDirectives).toHaveLength(0);
  });

  it('should handle mixed file-level and function-level directives', () => {
    const source = `
      "use client";
      export function Component() {
        "use server";
        return true;
      }
    `;
    const { program } = parse(source);
    const directives = findDirectives(program);

    expect(directives.useClient).toBe(true);
    expect(directives.useServer).toBe(true);
    expect(directives.fileLevelClientDirective).toBeDefined();
    expect(directives.functionLevelServerDirectives).toHaveLength(1);
    expect(directives.functionLevelServerDirectives[0].name).toBe('Component');
  });

  it('should not detect directives after non-directive statements in file', () => {
    const source = `
      const x = 1;
      "use server";
      export function action() {}
    `;
    const { program } = parse(source);
    const directives = findDirectives(program);

    expect(directives.useServer).toBe(false);
    expect(directives.fileLevelServerDirective).toBeUndefined();
    expect(directives.functionLevelServerDirectives).toHaveLength(0);
  });

  it('should not detect directives after non-directive statements in function', () => {
    const source = `
      export function action() {
        const x = 1;
        "use server";
        return true;
      }
    `;
    const { program } = parse(source);
    const directives = findDirectives(program);

    expect(directives.useServer).toBe(false);
    expect(directives.functionLevelServerDirectives).toHaveLength(0);
  });

  it('should detect multiple file-level directives in correct order', () => {
    const source = `
      "use client";
      "use server";
      export function Component() {}
    `;
    const { program } = parse(source);
    const directives = findDirectives(program);

    expect(directives.useClient).toBe(true);
    expect(directives.useServer).toBe(true);
    expect(directives.fileLevelClientDirective).toBeDefined();
    expect(directives.fileLevelServerDirective).toBeDefined();
  });

  it('should detect function-level directive in anonymous function', () => {
    const source = `
      export const action = function() {
        "use server";
        return true;
      }
    `;
    const { program } = parse(source);
    const directives = findDirectives(program);

    expect(directives.useServer).toBe(true);
    expect(directives.functionLevelServerDirectives).toHaveLength(1);
    expect(directives.functionLevelServerDirectives[0].name).toBe('action');
  });

  it('should detect function-level directive in arrow function with block body', () => {
    const source = `
      export const action = () => {
        "use server";
        return true;
      }
    `;
    const { program } = parse(source);
    const directives = findDirectives(program);

    expect(directives.useServer).toBe(true);
    expect(directives.functionLevelServerDirectives).toHaveLength(1);
    expect(directives.functionLevelServerDirectives[0].name).toBe('action');
  });
}); 