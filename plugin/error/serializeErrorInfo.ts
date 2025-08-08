export function serializeErrorInfo(errorInfo: unknown): null | {
  componentStack?: string | undefined;
  digest?: string | undefined;
} {
  if(errorInfo == null || typeof errorInfo !== "object") {
    return null;
  }
  const { componentStack, digest, ...rest } = errorInfo as {
    componentStack?: string;
    digest?: string;
  };
  return {
    componentStack: componentStack,
    digest: digest,
    ...rest,
  };
}
