export function logError(
  message: string,
  context: Record<string, any> = {},
  error?: unknown
) {
  const errorObj = {
    level: 'error',
    message,
    timestamp: new Date().toISOString(),
    ...context,
    error: error instanceof Error ?
      { message: error.message, stack: error.stack, name: error.name } :
      error,
  };

  console.error(JSON.stringify(errorObj));
}

export function logInfo(
  message: string,
  context: Record<string, any> = {}
) {
  const infoObj = {
    level: 'info',
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  console.log(JSON.stringify(infoObj));
}
