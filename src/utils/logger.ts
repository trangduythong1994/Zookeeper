type LogContext = Record<string, unknown>;

function write(level: string, message: string, context?: LogContext): void {
  const suffix = context ? ` ${JSON.stringify(context)}` : "";
  console.log(`${new Date().toISOString()} [${level}] ${message}${suffix}`);
}

export const logger = {
  error(message: string, context?: LogContext): void {
    write("ERROR", message, context);
  },
  info(message: string, context?: LogContext): void {
    write("INFO", message, context);
  },
  warn(message: string, context?: LogContext): void {
    write("WARN", message, context);
  },
};
