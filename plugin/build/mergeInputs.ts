import type { InputOption } from "rollup";
import type { InputNormalizer, InputNormalizerWorker } from "../types.js";

export const mergeInputsAsync = async (
  input: { [key: string]: string },
  input2: InputOption | undefined,
  inputNormalizer: InputNormalizerWorker
): Promise<Record<string, string>> => {
  if(typeof input === "undefined"){
    throw new Error("The first input can not be undefined");
  } else if(typeof input2 === "undefined") {
    return input;
  } else if(Array.isArray(input2)) {
    const inputsFromArray = Object.fromEntries(await Promise.all(input2.map(async (input)=>inputNormalizer(input))))
    return {  
      ...input,
      ...inputsFromArray,
    }
  } else if(typeof input2 === "object" && input2 != null) {
    return { ...input, ...input2 };
  } else if (typeof input2 === "string") {
    const [key, value] = await inputNormalizer(input2)
    return {
      ...input,
      [key]: value,
    }
  } else {
    throw new Error(`Invalid input: ${input2}`);
  }
}

export const mergeInputs = (
  input: { [key: string]: string },
  input2: InputOption | undefined,
  inputNormalizer: InputNormalizer
): Record<string, string> => {
  if(typeof input === "undefined"){
    throw new Error("The first input can not be undefined");
  } else if(typeof input2 === "undefined") {
    return input;
  } else if(Array.isArray(input2)) {
    const inputsFromArray = Object.fromEntries(input2.map(inputNormalizer))
    return {
      ...input,
      ...inputsFromArray,
    }
  } else if(typeof input2 === "object" && input2 != null) {
    return { ...input, ...input2 };
  } else if (typeof input2 === "string") {
    const [key, value] = inputNormalizer(input2)
    return {
      ...input,
      [key]: value,
    }
  } else {
    throw new Error(`Invalid input: ${input2}`);
  }
};
