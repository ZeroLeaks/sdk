import type { ZeroLeaksOptions } from "./client";
import {
  ZeroLeaksAbortError,
  ZeroLeaksError,
  ZeroLeaksTimeoutError,
} from "./errors";

const SDK_VERSION = "0.3.0";
const DEFAULT_BASE_URL = "https://zeroleaks.ai";
const DEFAULT_TIMEOUT_MS = 30_000;
const TRAILING_SLASH_REGEX = /\/$/;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  timeoutMs?: number;
  authenticated?: boolean;
}

interface ApiErrorPayload {
  error?: string;
  message?: string;
  code?: string;
  [key: string]: unknown;
}

const getEnvironmentApiKey = (): string | undefined =>
  typeof process === "undefined"
    ? undefined
    : process.env.ZEROLEAKS_API_KEY?.trim();

const buildQueryString = (
  query?: Record<string, string | number | boolean | undefined>
): string => {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
};

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
};

const readResponsePayload = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const createResponseError = (
  response: Response,
  payload: unknown
): ZeroLeaksError => {
  const errorPayload =
    payload && typeof payload === "object"
      ? (payload as ApiErrorPayload)
      : undefined;

  return new ZeroLeaksError(
    errorPayload?.error ??
      errorPayload?.message ??
      `ZeroLeaks API request failed with status ${response.status}`,
    {
      status: response.status,
      code: errorPayload?.code,
      details: payload,
      requestId:
        response.headers.get("x-request-id") ??
        response.headers.get("cf-ray") ??
        undefined,
      retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
    }
  );
};

export class Transport {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;
  private readonly fetchImplementation: typeof globalThis.fetch;

  constructor(options: ZeroLeaksOptions) {
    const apiKey = options.apiKey?.trim() || getEnvironmentApiKey();
    if (!apiKey) {
      throw new ZeroLeaksError(
        "Missing ZeroLeaks API key. Pass apiKey or set ZEROLEAKS_API_KEY.",
        { code: "MISSING_API_KEY" }
      );
    }
    if (!apiKey.startsWith("zl_live_")) {
      throw new ZeroLeaksError("ZeroLeaks API keys must start with zl_live_.", {
        code: "INVALID_API_KEY",
      });
    }

    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(
      TRAILING_SLASH_REGEX,
      ""
    );
    this.defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    if (!this.fetchImplementation) {
      throw new ZeroLeaksError(
        "No fetch implementation is available. Use Node.js 18+, Bun, or pass fetch.",
        { code: "MISSING_FETCH" }
      );
    }
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const timeout = setTimeout(
      () => controller.abort(new ZeroLeaksTimeoutError()),
      timeoutMs
    );
    const onAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const headers = new Headers({
        Accept: "application/json",
        "X-ZeroLeaks-SDK": `typescript/${SDK_VERSION}`,
      });
      if (options.authenticated !== false) {
        headers.set("Authorization", `Bearer ${this.apiKey}`);
      }

      let body: BodyInit | undefined;
      if (options.formData) {
        body = options.formData;
      } else if (options.body !== undefined) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(options.body);
      }

      const response = await this.fetchImplementation(
        `${this.baseUrl}${path}${buildQueryString(options.query)}`,
        {
          method,
          headers,
          body,
          signal: controller.signal,
        }
      );

      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw createResponseError(response, payload);
      }

      return payload as T;
    } catch (error) {
      if (error instanceof ZeroLeaksError) {
        throw error;
      }
      if (options.signal?.aborted) {
        throw new ZeroLeaksAbortError(undefined, error);
      }
      if (controller.signal.aborted) {
        throw new ZeroLeaksTimeoutError(undefined, error);
      }
      throw new ZeroLeaksError("Unable to reach the ZeroLeaks API", {
        code: "NETWORK_ERROR",
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }
}
