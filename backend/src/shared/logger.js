import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.isTest ? 'silent' : config.logLevel,
  redact: {
    paths: [
      'password', 'newPassword', 'currentPassword', 'passwordHash', 'password_hash',
      'token', 'accessToken', 'refreshToken', 'initialPassword',
      'req.headers.authorization', 'headers.authorization', 'authorization',
    ],
    censor: '[redacted]',
  },
});
