import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/index.js';
import { requestId } from './middleware/requestId.js';
import { globalLimiter } from './middleware/rateLimiters.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes.js';

/**
 * Express application. Exported WITHOUT listening, so Supertest can bind an
 * ephemeral port per suite.
 *
 * Middleware order is normative (system-architecture 3):
 *   requestId -> helmet -> cors -> json -> rateLimit -> routes -> notFound -> errorHandler
 */
export const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(requestId);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin and tooling requests have no Origin header.
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes(origin)) return callback(null, true);
      // Deny by omitting the header rather than throwing: the browser enforces.
      return callback(null, false);
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '100kb' }));
app.use(globalLimiter);

app.use('/api', apiRouter);

// Test-only route proving the unexpected-error path returns a stack-free 500.
if (config.isTest) {
  app.get('/api/__test_boom', () => {
    throw new Error('boom: deliberate test failure');
  });
}

app.use(notFound);
app.use(errorHandler);
