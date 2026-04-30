// `props` is a function so it runs per-request — RSC props can depend on `url`.
export const props = (_url: string) => ({ name: "world" });
