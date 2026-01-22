import { requestIdStore } from '../middlewares/requestId';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogData {
  message: string;
  [key: string]: any;
}

class Logger {
  private log(level: LogLevel, data: LogData) {
    const requestId = requestIdStore.getStore();
    const timestamp = new Date().toISOString();
    
    const logEntry = {
      timestamp,
      level,
      requestId,
      ...data
    };

    console.log(JSON.stringify(logEntry));
  }

  info(message: string, context: Record<string, any> = {}) {
    this.log('info', { message, ...context });
  }

  warn(message: string, context: Record<string, any> = {}) {
    this.log('warn', { message, ...context });
  }

  error(message: string, context: Record<string, any> = {}) {
    this.log('error', { message, ...context });
  }

  debug(message: string, context: Record<string, any> = {}) {
    this.log('debug', { message, ...context });
  }
}

export const logger = new Logger();
