/**
 * The single response envelope (master-sdd 14). Every response in the API,
 * including 404s and unexpected 500s, is built here.
 */
export const ok = (data, meta = {}) => ({ success: true, data, meta });

export const fail = (error, meta = {}) => ({
  success: false,
  error: {
    code: error.code,
    message: error.message,
    ...(error.details !== undefined ? { details: error.details } : {}),
  },
  meta,
});
