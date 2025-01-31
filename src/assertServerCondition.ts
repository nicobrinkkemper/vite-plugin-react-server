function assertServerCondition<P extends typeof process>(p: P): asserts p is P & { env: { NODE_OPTIONS: string } } {
    const nodeOptions = p.env['NODE_OPTIONS'];
    if (!nodeOptions?.match(/--conditions[= ]react-server/)) {
        if(!nodeOptions?.match(/--conditions/)) {
            console.warn(`process.env['NODE_OPTIONS'] is missing \`--conditions\` flag, it should be like \`--conditions=react-server\` or \`--conditions react-server\`, but was ${JSON.stringify(process.env['NODE_OPTIONS'])}`);
        }
        if(!nodeOptions?.match(/react-server/)) {
            throw new Error(`process.env['NODE_OPTIONS'] is missing \`react-server\` flag, it should be like \`--conditions=react-server\` or \`--conditions react-server\`, but was ${JSON.stringify(process.env['NODE_OPTIONS'])}`);
        }
    }
    return undefined;
  };
assertServerCondition(process);