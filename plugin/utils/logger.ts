import { createLogger as createViteLogger, type LogLevel } from 'vite';


const isPrimitive = (value: any) => {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'symbol';
}

const buildMessage = (prefix: string, msg: string, ...args: any[]) => {
  let buildMsg = `[${prefix}] ${msg}`
  for(const arg of args) {
    if(isPrimitive(arg)) {
      buildMsg += `\n[${prefix}] ${String(arg)}`;
    } else if(arg instanceof Error) {
      buildMsg += `\n[${prefix}] ${arg.name}`
      buildMsg += `\n[${prefix}] ${arg.message}`
      buildMsg += `\n[${prefix}] ${arg.stack}`
      buildMsg += `\n[${prefix}] ${arg.cause}`
    } else {
      buildMsg += `\n[${prefix}] ${JSON.stringify(arg)}`;
    }
  }
  return buildMsg;
}

export const createLogger = (process.env['NODE_ENV'] === 'development') ? (prefix: string, logLevel: LogLevel = 'info') => {
  const logger = createViteLogger(logLevel, {
    allowClearScreen: true
  });
  return {
    clear: () => logger.clearScreen('info'),
    info: (msg: string, ...args: any[]) => {
      console.log(buildMessage(prefix, msg, ...args))
    },
    warn: (msg: string, ...args: any[]) => {
      console.warn(buildMessage(prefix, msg, ...args))
    },
    error: (msg: string, ...args: any[]) => {
      console.error(buildMessage(prefix, msg, ...args))
    },
    debug: (msg: string, ...args: any[]) => {
      console.debug(buildMessage(prefix, msg, ...args))
    }
  };
} : () => {
  return {
    clear: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
};