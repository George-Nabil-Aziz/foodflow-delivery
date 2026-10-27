import { z } from 'zod';
import { ValidationError } from '../shared/errors/AppError.js';

// A missing field reads "Required", as it did before Zod 4; the client's
// catalogues translate that text. Schema-specific messages still win.
z.config({
  customError: (issue) => (issue.input === undefined ? 'Required' : undefined),
});

/**
 * Parses body/params/query with Zod and writes the result to `req.validated`.
 *
 * Two properties matter here. Controllers read `req.validated`, never `req.body`
 * (BR-F2, enforced by lint). And Zod object schemas strip unknown keys, so an
 * injected `role`, `status` or `price` never reaches a service - mass
 * assignment is closed by construction rather than by a blocklist.
 */
export const validate = (schemas) => (req, _res, next) => {
  const out = {};
  for (const key of ['body', 'params', 'query']) {
    if (!schemas[key]) continue;
    const parsed = schemas[key].safeParse(req[key]);
    if (!parsed.success) {
      return next(
        new ValidationError('VALIDATION_ERROR', {
          details: parsed.error.issues.map((i) => ({
            field: i.path.join('.') || key,
            issue: i.message,
          })),
        }),
      );
    }
    out[key] = parsed.data;
  }
  req.validated = { ...(req.validated ?? {}), ...out };
  next();
};
