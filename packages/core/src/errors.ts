/** Structured application error. Never leak stack traces to clients. */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "BUDGET_EXCEEDED"
  | "APPROVAL_REQUIRED"
  | "PROVIDER_FAILURE"
  | "DEPENDENCY_UNAVAILABLE"
  | "TIMEOUT"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  BUDGET_EXCEEDED: 402,
  APPROVAL_REQUIRED: 202,
  PROVIDER_FAILURE: 502,
  DEPENDENCY_UNAVAILABLE: 503,
  TIMEOUT: 504,
  INTERNAL: 500,
};

const RETRYABLE: ReadonlySet<ErrorCode> = new Set([
  "RATE_LIMITED",
  "PROVIDER_FAILURE",
  "DEPENDENCY_UNAVAILABLE",
  "TIMEOUT",
]);

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;

  constructor(
    code: ErrorCode,
    message: string,
    opts?: { details?: Record<string, unknown>; cause?: unknown; requestId?: string }
  ) {
    super(message, opts?.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "AppError";
    this.code = code;
    this.statusCode = STATUS[code];
    this.retryable = RETRYABLE.has(code);
    this.details = opts?.details;
    this.requestId = opts?.requestId;
  }

  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        requestId: this.requestId,
        retryable: this.retryable,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
