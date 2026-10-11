import crypto from 'node:crypto';

/** Correlation ID echoed in the header, the envelope meta and every log line. */
export function requestId(req, res, next) {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
