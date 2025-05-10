// Create a shared map to store module references
export const moduleRefs = new Map<string, { id: string }>();

export function getModuleRef(id: string): { id: string } {
  let moduleRef = moduleRefs.get(id);
  if (!moduleRef) {
    moduleRef = { id };
    moduleRefs.set(id, moduleRef);
  }
  return moduleRef;
} 