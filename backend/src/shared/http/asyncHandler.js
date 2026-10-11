/**
 * Forwards rejections from async route handlers to the error middleware.
 *
 * Express 4 does not await handlers, so an `AppError` thrown inside an async
 * controller escapes as an unhandled rejection instead of reaching
 * `errorHandler` - the request hangs and the process is left in a bad state.
 * Every controller is wrapped through `wrapAll` at the router boundary, so the
 * controllers themselves stay plain async functions.
 */
export const asyncHandler = (fn) =>
  function wrapped(req, res, next) {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };

/** Wraps every function exported by a controller module. */
export function wrapAll(controllerModule) {
  const out = {};
  for (const [name, value] of Object.entries(controllerModule)) {
    out[name] = typeof value === 'function' ? asyncHandler(value) : value;
  }
  return out;
}
