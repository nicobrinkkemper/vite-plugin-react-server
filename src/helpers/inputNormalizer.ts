import { relative } from "node:path";

type NormalizedInputOptions = {
  // will automatically remove this part
  root?: string;
};

export const createInputNormalizer =
  (
    {
      root = process.cwd(),
    }: NormalizedInputOptions = {} as NormalizedInputOptions
  ) =>
  ([key, path]: [string, string]) =>
    [
      key,
      path.startsWith(root)
        ? relative(root, path)
        : path.startsWith("/")
        ? path
        : `/${path}`,
    ];
