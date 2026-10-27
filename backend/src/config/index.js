import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    TEST_DATABASE_URL: z.string().optional(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
    JWT_ISSUER: z.string().default('foodflow'),
    JWT_AUDIENCE: z.string().default('foodflow-app'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    // Egypt: 14% VAT, Cairo time.
    TAX_RATE: z.coerce.number().min(0).max(1).default(0.14),
    PLATFORM_TIMEZONE: z.string().default('Africa/Cairo'),
    ORDER_ACCEPT_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(10),
    DELIVERY_OFFER_TTL_SECONDS: z.coerce.number().int().positive().default(90),
    UNASSIGNED_ESCALATION_MINUTES: z.coerce.number().int().positive().default(15),
    // Card payments (spec-11). With no keys the deterministic `fake` provider
    // is used, which production never accepts as a way to take payment.
    PAYMENT_PROVIDER: z.enum(['moyasar', 'fake']).optional(),
    MOYASAR_SECRET_KEY: z.string().trim().optional(),
    MOYASAR_PUBLISHABLE_KEY: z.string().trim().optional(),
    MOYASAR_WEBHOOK_SECRET: z.string().trim().optional(),
    MOYASAR_API_URL: z.string().url().default('https://api.moyasar.com/v1'),
    PAYMENT_CURRENCY: z.string().length(3).default('EGP'),
    PAYMENT_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(15),
    LOG_LEVEL: z.string().default('info'),
    RUN_JOBS: z
      .union([z.boolean(), z.string()])
      .default(true)
      .transform((v) => v === true || v === 'true'),
    // Scales every background job interval. 1 in production; an end-to-end run
    // lowers it so dispatch is observable inside a test's timeout rather than
    // on the 20-second production cadence.
    JOB_INTERVAL_SCALE: z.coerce.number().positive().max(1).default(1),
    // Scales every rate-limit bucket. 1 in production; an end-to-end run
    // raises it so the suite's own traffic does not trip a control that is
    // working correctly. Never below 1, so limits can only be relaxed for a
    // test environment, never tightened into a surprise.
    RATE_LIMIT_MULTIPLIER: z.coerce.number().min(1).default(1),
    // Notification transports. All optional: with none set, notifications are
    // recorded and logged only (the `log` transport), so dev and tests need no
    // accounts. Empty strings count as unset so a blank .env line is harmless.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    SMTP_SECURE: z
      .union([z.boolean(), z.string()])
      .default(false)
      .transform((v) => v === true || v === 'true'),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM: z.string().optional(),
    NOTIFY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(4),
    NOTIFY_RETRY_BASE_SECONDS: z.coerce.number().int().positive().default(60),
    NOTIFY_RECIPIENT_HOURLY_LIMIT: z.coerce.number().int().positive().default(20),
    SEED_ADMIN_EMAIL: z.string().email().default('sayed.hanafy@foodflow.com'),
    SEED_ADMIN_PASSWORD: z.string().min(8).default('Admin123!seed'),
    SEED_USER_PASSWORD: z.string().min(8).default('Passw0rd!seed'),
  })
  .superRefine((v, ctx) => {
    if (v.PAYMENT_PROVIDER === 'moyasar' && !(v.MOYASAR_SECRET_KEY && v.MOYASAR_PUBLISHABLE_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYMENT_PROVIDER'],
        message: 'PAYMENT_PROVIDER=moyasar needs MOYASAR_SECRET_KEY and MOYASAR_PUBLISHABLE_KEY',
      });
    }
    // Security: a wildcard CORS origin must be impossible in production.
    if (v.NODE_ENV === 'production' && v.CORS_ORIGINS.split(',').some((o) => o.trim() === '*')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS must not contain "*" in production',
      });
    }
  });

/**
 * Parses and validates the environment. Throws (so the process exits) rather
 * than letting an invalid configuration surface at the first request.
 */
export function parseConfig(env = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid configuration — ${detail}`);
  }
  const v = result.data;

  // The test harness must never point at a non-test database: the suite
  // truncates tables between tests.
  const databaseUrl =
    v.NODE_ENV === 'test' ? (v.TEST_DATABASE_URL ?? v.DATABASE_URL) : v.DATABASE_URL;

  // Tests never reach a gateway, whatever keys the developer's .env holds.
  const hasKeys = Boolean(v.MOYASAR_SECRET_KEY && v.MOYASAR_PUBLISHABLE_KEY);
  const paymentProvider =
    v.NODE_ENV === 'test' ? 'fake' : (v.PAYMENT_PROVIDER ?? (hasKeys ? 'moyasar' : 'fake'));

  return Object.freeze({
    env: v.NODE_ENV,
    isProduction: v.NODE_ENV === 'production',
    isTest: v.NODE_ENV === 'test',
    port: v.PORT,
    databaseUrl,
    jwt: Object.freeze({
      secret: v.JWT_SECRET,
      accessTtl: v.JWT_ACCESS_TTL,
      refreshTtlDays: v.JWT_REFRESH_TTL_DAYS,
      issuer: v.JWT_ISSUER,
      audience: v.JWT_AUDIENCE,
    }),
    bcryptRounds: v.BCRYPT_ROUNDS,
    corsOrigins: Object.freeze(v.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)),
    taxRate: v.TAX_RATE,
    platformTimezone: v.PLATFORM_TIMEZONE,
    orderAcceptTimeoutMinutes: v.ORDER_ACCEPT_TIMEOUT_MINUTES,
    deliveryOfferTtlSeconds: v.DELIVERY_OFFER_TTL_SECONDS,
    unassignedEscalationMinutes: v.UNASSIGNED_ESCALATION_MINUTES,
    payments: Object.freeze({
      provider: paymentProvider,
      // The fake provider confirms anything it is told to, so it may not take
      // card payments where real money is at stake.
      cardEnabled: paymentProvider === 'moyasar' || v.NODE_ENV !== 'production',
      secretKey: v.MOYASAR_SECRET_KEY || null,
      publishableKey: v.MOYASAR_PUBLISHABLE_KEY || null,
      webhookSecret: v.MOYASAR_WEBHOOK_SECRET || null,
      apiUrl: v.MOYASAR_API_URL.replace(/\/+$/, ''),
      currency: v.PAYMENT_CURRENCY.toUpperCase(),
      timeoutMinutes: v.PAYMENT_TIMEOUT_MINUTES,
    }),
    logLevel: v.LOG_LEVEL,
    runJobs: v.RUN_JOBS,
    jobIntervalScale: v.JOB_INTERVAL_SCALE,
    rateLimitMultiplier: v.RATE_LIMIT_MULTIPLIER,
    notifications: Object.freeze({
      smtp: Object.freeze({
        host: v.SMTP_HOST || null,
        port: v.SMTP_PORT,
        user: v.SMTP_USER || null,
        pass: v.SMTP_PASS || null,
        from: v.SMTP_FROM || v.SMTP_USER || 'FoodFlow <no-reply@foodflow.local>',
        secure: v.SMTP_SECURE,
      }),
      twilio: Object.freeze({
        accountSid: v.TWILIO_ACCOUNT_SID || null,
        authToken: v.TWILIO_AUTH_TOKEN || null,
        from: v.TWILIO_FROM || null,
      }),
      maxAttempts: v.NOTIFY_MAX_ATTEMPTS,
      retryBaseSeconds: v.NOTIFY_RETRY_BASE_SECONDS,
      recipientHourlyLimit: v.NOTIFY_RECIPIENT_HOURLY_LIMIT,
    }),
    seed: Object.freeze({
      adminEmail: v.SEED_ADMIN_EMAIL,
      adminPassword: v.SEED_ADMIN_PASSWORD,
      userPassword: v.SEED_USER_PASSWORD,
    }),
  });
}

export const config = parseConfig();
