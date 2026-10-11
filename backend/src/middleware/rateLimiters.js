import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { fail } from '../shared/http/envelope.js';

/**
 * In-memory store: correct for a single replica, and documented as risk R-09.
 * With N replicas the effective limit becomes N times the configured one; the
 * fix is a shared store, which express-rate-limit supports as a drop-in.
 */
const handler = (req, res) =>
  res.status(429).json(
    fail({ code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again shortly.' },
      { requestId: req.id }),
  );

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip: () => config.isTest,
};

/**
 * Every limit is scaled by `RATE_LIMIT_MULTIPLIER`, which is 1 everywhere
 * except an end-to-end run.
 *
 * A browser suite drives dozens of registrations and logins from one address
 * in a couple of minutes, which is exactly the shape the auth limiter exists
 * to stop. Disabling the limiter for those runs would leave the control
 * untested; scaling it keeps every bucket in force, in proportion, while the
 * suite stays under them.
 */
const scaled = (limit) => Math.ceil(limit * config.rateLimitMultiplier);

export const globalLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: scaled(300) });

export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: scaled(10),
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email ?? '').toLowerCase()}`,
});

export const refreshLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: scaled(60) });

export const checkoutLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: scaled(20),
  keyGenerator: (req) => req.user?.id ?? req.ip,
});

export const reviewLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: scaled(10),
  keyGenerator: (req) => req.user?.id ?? req.ip,
});
