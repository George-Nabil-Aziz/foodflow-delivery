import { CODES, PUBLIC_MESSAGES, isRegisteredCode } from './codes.js';

/**
 * Base application error. Carries the HTTP status, the stable error code, a
 * public message for the client and an internal message for the logs.
 *
 * The split between `message` (logged) and `publicMessage` (returned) is what
 * keeps internal detail out of responses while keeping incidents debuggable.
 */
export class AppError extends Error {
  constructor(code, { message, details, expectedStatus, cause } = {}) {
    if (!isRegisteredCode(code)) {
      throw new Error(`Error code "${code}" is not in the registry (shared/errors/codes.js)`);
    }
    const status = CODES[code];
    if (expectedStatus && expectedStatus !== status) {
      throw new Error(`Code ${code} is registered as ${status}, not ${expectedStatus}`);
    }
    super(message ?? PUBLIC_MESSAGES[code] ?? code);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.publicMessage = PUBLIC_MESSAGES[code] ?? 'Request could not be completed.';
    this.details = details;
    this.expose = true;
    if (cause) this.cause = cause;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(code = 'VALIDATION_ERROR', opts) { super(code, { ...opts, expectedStatus: 422 }); }
}
export class UnauthorizedError extends AppError {
  constructor(code = 'TOKEN_INVALID', opts) { super(code, { ...opts, expectedStatus: 401 }); }
}
export class ForbiddenError extends AppError {
  constructor(code = 'FORBIDDEN_ROLE', opts) { super(code, { ...opts, expectedStatus: 403 }); }
}
export class NotFoundError extends AppError {
  constructor(code = 'RESOURCE_NOT_FOUND', opts) { super(code, { ...opts, expectedStatus: 404 }); }
}
export class ConflictError extends AppError {
  constructor(code = 'CONFLICT', opts) { super(code, { ...opts, expectedStatus: 409 }); }
}
export class BadRequestError extends AppError {
  constructor(code = 'MALFORMED_REQUEST', opts) { super(code, { ...opts, expectedStatus: 400 }); }
}
export class InternalError extends AppError {
  constructor(code = 'INTERNAL_ERROR', opts) { super(code, { ...opts, expectedStatus: 500 }); }
}
