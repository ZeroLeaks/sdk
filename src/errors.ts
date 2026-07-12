export interface ZeroLeaksErrorOptions {
  status?: number;
  code?: string;
  details?: unknown;
  requestId?: string;
  retryAfterMs?: number;
  cause?: unknown;
}

export class ZeroLeaksError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly requestId?: string;
  readonly retryAfterMs?: number;

  constructor(message: string, options: ZeroLeaksErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "ZeroLeaksError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export class ZeroLeaksTimeoutError extends ZeroLeaksError {
  constructor(message = "The ZeroLeaks request timed out", cause?: unknown) {
    super(message, { code: "TIMEOUT", cause });
    this.name = "ZeroLeaksTimeoutError";
  }
}

export class ZeroLeaksAbortError extends ZeroLeaksError {
  constructor(message = "The ZeroLeaks request was aborted", cause?: unknown) {
    super(message, { code: "ABORTED", cause });
    this.name = "ZeroLeaksAbortError";
  }
}

export class ZeroLeaksScanError extends ZeroLeaksError {
  readonly scanId: string;

  constructor(scanId: string, message: string, details?: unknown) {
    super(message, { code: "SCAN_FAILED", details });
    this.name = "ZeroLeaksScanError";
    this.scanId = scanId;
  }
}
