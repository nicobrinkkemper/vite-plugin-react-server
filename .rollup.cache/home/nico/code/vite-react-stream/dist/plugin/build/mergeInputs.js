import { createInputNormalizer } from "../helpers/inputNormalizer.js";
export const mergeInputs = (input, input2, inputNormalizer) => {
    if (typeof input === "undefined") {
        throw new Error("The first input can not be undefined");
    }
    else if (typeof input2 === "undefined") {
        return input;
    }
    else if (Array.isArray(input2)) {
        const inputsFromArray = Object.fromEntries(input2.map(inputNormalizer));
        return {
            ...input,
            ...inputsFromArray,
        };
    }
    else if (typeof input2 === "object" && input2 != null) {
        return { ...input, ...input2 };
    }
    else if (typeof input2 === "string") {
        const [key, value] = inputNormalizer(input2);
        return {
            ...input,
            [key]: value,
        };
    }
    else {
        throw new Error(`Invalid input: ${input2}`);
    }
};
//# sourceMappingURL=mergeInputs.js.map