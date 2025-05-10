const stashedReturnValue = new Map<string, any>();
export const stashReturnValue = <FN extends (...args: any[]) => unknown>(
  fn: FN
): FN => {
  return ((...args: Parameters<FN>): ReturnType<FN> => {
    const id = args
      .map((arg) =>!arg ? '' : typeof arg === "string" ? arg : typeof arg === "object" && 'id' in arg ? arg.id : '')
      .join("_");
    if (stashedReturnValue.has(id)) {
      return stashedReturnValue.get(id);
    }
    const result = fn(...args);
    stashedReturnValue.set(id, result);
    return result as never;
  }) as FN;
};