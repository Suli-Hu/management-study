export function defineMiddleware<T extends (...args: never[]) => unknown>(handler: T): T {
  return handler;
}
