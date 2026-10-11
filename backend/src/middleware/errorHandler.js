import { AppError } from '../shared/errors/AppError.js';
import { mapPgError } from '../shared/errors/pgErrorMapper.js';
import { fail } from '../shared/http/envelope.js';
import { logger } from '../shared/logger.js';

/**
 * The single terminal error handler. Maps AppError to the envelope and anything
 * else to a generic 500 with the stack logged against the request ID, so no
 * stack trace, SQL fragment or file path ever leaves the process.
 */

export function errorHandler(err, req, res, _next) {
  const e = err instanceof AppError ? err : mapPgError(err);

  // Body parser failures arrive as SyntaxError with a status.
  if (!(e instanceof AppError) && e instanceof SyntaxError && 'body' in e) {
    return res.status(400).json(
      fail({ code: 'MALFORMED_REQUEST', message: 'The request body is not valid JSON.' },
        { requestId: req.id }),
    );
  }
  if (!(e instanceof AppError) && e?.type === 'entity.too.large') {
    return res.status(413).json(
      fail({ code: 'MALFORMED_REQUEST', message: 'The request body is too large.' },
        { requestId: req.id }),
    );
  }

  if (e instanceof AppError) {
    const payload = { code: e.code, requestId: req.id, userId: req.user?.id };
    if (e.status >= 500) logger.error({ ...payload, err: e }, e.message);
    else logger.warn(payload, e.message);

    return res.status(e.status).json(
      fail({ code: e.code, message: e.publicMessage, details: e.details }, { requestId: req.id }),
    );
  }

  logger.error({ err, requestId: req.id }, 'Unhandled error');
  return res.status(500).json(
    fail({ code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
      { requestId: req.id }),
  );
}
