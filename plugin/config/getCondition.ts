export const getCondition = <Prefix extends string = "react-">(
  prefix: Prefix = "react-" as Prefix
): `${Prefix}client` | `${Prefix}server` => {
  return process.env["NODE_OPTIONS"]?.match(/--conditions[= ]react-server/)
    ? (`${prefix}server` as `${Prefix}server`)
    : (`${prefix}client` as `${Prefix}client`);
};

export const isReactServerCondition = (condition: string = getCondition()) =>
  condition === "react-server";

export const isReactClientCondition = (condition: string = getCondition()) =>
  condition === "react-client";
