import * as actions from './actions.server.js';
export const props = async () => {
  return {
    add: actions.add,
    subtract: actions.subtract,
  };
};