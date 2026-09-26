import {
  ZeroLeaksAbortError,
  ZeroLeaksError,
  ZeroLeaksScanError,
  ZeroLeaksTimeoutError,
} from "./errors";
import { Transport } from "./transport";
import type {
  AgentConfigInput,
  AgentConfigListResponse,
  AgentReport,
  AgentScanListResponse,
  AgentScanResult,
  ArchiveScanOptions,
  CapabilitiesResponse,
  CreateRuntimeScanResponse,
  CreateScanRequest,
  CreateScanResponse,
  CreateSkillScanRequest,
  CreateSkillScanResponse,
  HealthResponse,
  ListOptions,
  ReportListResponse,
  RuntimeRunOptions,
  RuntimeScan,
  RuntimeScanEvent,
  RuntimeScanListResponse,
  RuntimeScanOptions,
  RuntimeScanTarget,
  RuntimeTargetDefinition,
  RuntimeTargetMessage,
  RuntimeTargetResponse,
  ScanListResponse,
  ScanReport,
  ScanResult,
  SkillScanListResponse,
  SkillScanResult,
  WaitOptions,
} from "./types";

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_WAIT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_RUNTIME_EVENT_POLL_INTERVAL_MS = 500;
const DEFAULT_RUNTIME_EVENT_CONCURRENCY = 8;
const DEFAULT_RUNTIME_WORKER_STALL_TIMEOUT_MS = 6 * 60 * 1000;
const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "canceled",
]);

export interface ZeroLeaksOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

const sleep = async (durationMs: number, signal?: AbortSignal) => {
  await new Promise<void>((resolve, reject) => {
    const complete = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timeout = setTimeout(complete, durationMs);
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      reject(new ZeroLeaksAbortError(undefined, signal?.reason));
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
};

const waitForScan = async <T>(
  getResult: () => Promise<T>,
  getStatus: (result: T) => string,
  timeoutMessage: string,
  options: WaitOptions<T>
): Promise<T> => {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  while (true) {
    const result = await getResult();
    await options.onPoll?.(result);
    if (TERMINAL_STATUSES.has(getStatus(result))) {
      return result;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new ZeroLeaksTimeoutError(timeoutMessage);
    }
    await sleep(pollIntervalMs, options.signal);
  }
};

const sanitizeForTransport = (
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): unknown => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack,
    };
  }
  if (value instanceof Uint8Array) {
    return Array.from(value);
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForTransport(item, seen));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = sanitizeForTransport(item, seen);
    if (normalized !== undefined) {
      sanitized[key] = normalized;
    }
  }
  return sanitized;
};

const normalizeRuntimeTargetResponse = (
  value: RuntimeTargetResponse | string
): RuntimeTargetResponse => {
  if (typeof value === "string") {
    return { text: value };
  }
  if (!value || typeof value.text !== "string") {
    throw new ZeroLeaksError("Runtime target must return text", {
      code: "INVALID_TARGET_RESPONSE",
    });
  }
  return value;
};

class ScansApi {
  private readonly reports: ReportsApi;
  private readonly transport: Transport;

  constructor(transport: Transport, reports: ReportsApi) {
    this.transport = transport;
    this.reports = reports;
  }

  /**
   * @deprecated Prompt scans are retired. The server answers 410 Gone and this
   * call rejects with a `ZeroLeaksError` whose `code` is
   * `"PROMPT_SCANS_RETIRED"`. Use `agentScans.run` or `runtimeScans.run` to
   * test a deployed agent, or the source-available CLI (`npm i -g zeroleaks`) for a
   * standalone prompt. `get`, `list`, `cancel`, and `wait` keep working for
   * historical scans.
   */
  create(input: CreateScanRequest): Promise<CreateScanResponse> {
    return this.transport.request("/api/v1/scans", {
      method: "POST",
      body: input,
    });
  }

  get(scanId: string, signal?: AbortSignal): Promise<ScanResult> {
    return this.transport.request(`/api/v1/scans/${scanId}`, { signal });
  }

  list(options: ListOptions = {}): Promise<ScanListResponse> {
    return this.transport.request("/api/v1/scans", {
      query: {
        cursor: options.cursor,
        limit: options.limit,
        workspaceId: options.workspaceId,
      },
    });
  }

  cancel(scanId: string): Promise<{ success: boolean }> {
    return this.transport.request(`/api/v1/scans/${scanId}/cancel`, {
      method: "POST",
    });
  }

  async wait(
    scanId: string,
    options: WaitOptions<ScanResult> = {}
  ): Promise<ScanResult> {
    return await waitForScan(
      () => this.get(scanId, options.signal),
      (result) => result.scan.status,
      `Timed out waiting for scan ${scanId}`,
      options
    );
  }

  /**
   * @deprecated Prompt scans are retired. Rejects with the same
   * `PROMPT_SCANS_RETIRED` `ZeroLeaksError` as `create` before any polling
   * starts. Use `agentScans.run` or `runtimeScans.run` instead.
   */
  async run(
    input: CreateScanRequest,
    options: WaitOptions<ScanResult> = {}
  ): Promise<{ scan: ScanResult["scan"]; report: ScanReport }> {
    const created = await this.create(input);
    const result = await this.wait(created.scanId, options);
    if (result.scan.status !== "completed") {
      throw new ZeroLeaksScanError(
        created.scanId,
        `Scan ended with status ${result.scan.status}`,
        result
      );
    }

    const report =
      result.report ?? (await this.reports.getByScan(created.scanId));
    return { scan: result.scan, report };
  }
}

class ReportsApi {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  get(reportId: string): Promise<ScanReport> {
    return this.transport.request(`/api/v1/reports/${reportId}`);
  }

  getByScan(scanId: string): Promise<ScanReport> {
    return this.transport.request(`/api/v1/reports/by-scan/${scanId}`);
  }

  list(options: ListOptions = {}): Promise<ReportListResponse> {
    return this.transport.request("/api/v1/reports", {
      query: {
        cursor: options.cursor,
        limit: options.limit,
        workspaceId: options.workspaceId,
      },
    });
  }
}

class AgentConfigsApi {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  list(workspaceId?: string): Promise<AgentConfigListResponse> {
    return this.transport.request("/api/v1/agent-configs", {
      query: { workspaceId },
    });
  }

  create(input: AgentConfigInput): Promise<{ id: string }> {
    return this.transport.request("/api/v1/agent-configs", {
      method: "POST",
      body: input,
    });
  }

  update(
    configId: string,
    input: AgentConfigInput
  ): Promise<{ success: boolean }> {
    return this.transport.request(`/api/v1/agent-configs/${configId}`, {
      method: "PATCH",
      body: input,
    });
  }

  delete(configId: string): Promise<{ success: boolean }> {
    return this.transport.request(`/api/v1/agent-configs/${configId}`, {
      method: "DELETE",
    });
  }
}

class AgentScansApi {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  create(agentConfigId: string): Promise<{
    scanId: string;
    workflowRunId: string;
    processingMethod: "workflow";
  }> {
    return this.transport.request("/api/v1/agent-scans", {
      method: "POST",
      body: { agentConfigId },
    });
  }

  get(scanId: string, signal?: AbortSignal): Promise<AgentScanResult> {
    return this.transport.request(`/api/v1/agent-scans/${scanId}`, { signal });
  }

  list(workspaceId?: string): Promise<AgentScanListResponse> {
    return this.transport.request("/api/v1/agent-scans", {
      query: { workspaceId },
    });
  }

  cancel(scanId: string): Promise<{ success: boolean }> {
    return this.transport.request(`/api/v1/agent-scans/${scanId}/cancel`, {
      method: "POST",
    });
  }

  async wait(
    scanId: string,
    options: WaitOptions<AgentScanResult> = {}
  ): Promise<AgentScanResult> {
    return await waitForScan(
      () => this.get(scanId, options.signal),
      (result) => result.scan.status,
      `Timed out waiting for agent scan ${scanId}`,
      options
    );
  }

  async run(
    agentConfigId: string,
    options: WaitOptions<AgentScanResult> = {}
  ): Promise<AgentScanResult> {
    const created = await this.create(agentConfigId);
    const result = await this.wait(created.scanId, options);
    if (result.scan.status !== "completed") {
      throw new ZeroLeaksScanError(
        created.scanId,
        `Agent scan ended with status ${result.scan.status}`,
        result
      );
    }
    return result;
  }
}

class RuntimeScansApi {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  create(
    target: RuntimeTargetDefinition,
    options: RuntimeScanOptions = {}
  ): Promise<CreateRuntimeScanResponse> {
    const { workspaceId, ...scanOptions } = options;
    return this.transport.request("/api/v1/runtime-scans", {
      method: "POST",
      body: {
        target: sanitizeForTransport(target),
        options: sanitizeForTransport(scanOptions),
        workspaceId,
      },
    });
  }

  get(runtimeScanId: string, signal?: AbortSignal): Promise<RuntimeScan> {
    return this.transport.request(`/api/v1/runtime-scans/${runtimeScanId}`, {
      signal,
    });
  }

  list(
    options: { limit?: number; workspaceId?: string } = {}
  ): Promise<RuntimeScanListResponse> {
    return this.transport.request("/api/v1/runtime-scans", {
      query: options,
    });
  }

  cancel(runtimeScanId: string): Promise<{ success: boolean }> {
    return this.transport.request(
      `/api/v1/runtime-scans/${runtimeScanId}/cancel`,
      { method: "POST" }
    );
  }

  private claimNext(
    runtimeScanId: string,
    signal?: AbortSignal
  ): Promise<RuntimeScanEvent | undefined> {
    return this.transport.request(
      `/api/v1/runtime-scans/${runtimeScanId}/events/next`,
      { method: "POST", signal }
    );
  }

  private completeEvent(
    runtimeScanId: string,
    eventId: string,
    body: {
      claimToken: string;
      error?: string;
      response?: unknown;
    }
  ): Promise<{ success: boolean }> {
    return this.transport.request(
      `/api/v1/runtime-scans/${runtimeScanId}/events/${eventId}`,
      { method: "POST", body }
    );
  }

  private async executeEvent(
    target: RuntimeScanTarget,
    sessions: Map<string, RuntimeTargetMessage[]>,
    runtimeScanId: string,
    event: RuntimeScanEvent,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      if (event.kind === "reset") {
        sessions.delete(event.sessionId);
        await target.reset?.(event.sessionId);
        await this.completeEvent(runtimeScanId, event.id, {
          claimToken: event.claimToken,
          response: { ok: true },
        });
        return;
      }

      const message = event.message ?? "";
      const messages: RuntimeTargetMessage[] = [
        ...(sessions.get(event.sessionId) ?? []),
        { role: "user", content: message },
      ];
      const result = normalizeRuntimeTargetResponse(
        await target.invoke({
          runtimeScanId,
          eventId: event.id,
          sessionId: event.sessionId,
          message,
          messages,
          signal,
        })
      );
      sessions.set(
        event.sessionId,
        result.messages ?? [
          ...messages,
          { role: "assistant", content: result.text },
        ]
      );
      await this.completeEvent(runtimeScanId, event.id, {
        claimToken: event.claimToken,
        response: sanitizeForTransport({
          finishReason: result.finishReason,
          metadata: result.metadata,
          text: result.text,
          toolCalls: result.toolCalls,
          usage: result.usage,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.completeEvent(runtimeScanId, event.id, {
        claimToken: event.claimToken,
        error: message,
      }).catch(() => undefined);
      throw new ZeroLeaksScanError(
        runtimeScanId,
        `Runtime target failed: ${message}`,
        error
      );
    }
  }

  private getTerminalResult(
    runtimeScanId: string,
    scan: RuntimeScan
  ): { report: AgentReport; scan: RuntimeScan } | undefined {
    if (scan.status === "completed") {
      if (!scan.report) {
        throw new ZeroLeaksScanError(
          runtimeScanId,
          "Runtime scan completed without a report",
          scan
        );
      }
      return { report: scan.report, scan };
    }
    if (TERMINAL_STATUSES.has(scan.status)) {
      throw new ZeroLeaksScanError(
        runtimeScanId,
        scan.error ?? `Runtime scan ended with status ${scan.status}`,
        scan
      );
    }
    return undefined;
  }

  private ensureRunnerActive(
    runtimeScanId: string,
    startedAt: number,
    timeoutMs: number,
    signal?: AbortSignal
  ): void {
    if (signal?.aborted) {
      throw new ZeroLeaksAbortError(undefined, signal.reason);
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new ZeroLeaksTimeoutError(
        `Timed out running runtime scan ${runtimeScanId}`
      );
    }
  }

  private ensureWorkerActive(scan: RuntimeScan, stallTimeoutMs: number): void {
    if (
      scan.status === "running" &&
      scan.workerLastSeenAt &&
      Date.now() - scan.workerLastSeenAt >= stallTimeoutMs
    ) {
      throw new ZeroLeaksTimeoutError(
        `Runtime scan worker stopped making progress during ${scan.currentPhase ?? "the active phase"}`
      );
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: runtime relay coordination handles bounded concurrency, session ordering, polling, and cancellation in one lifecycle.
  async run(
    target: RuntimeScanTarget,
    options: RuntimeRunOptions = {}
  ): Promise<{ report: AgentReport; scan: RuntimeScan }> {
    const definition = await target.describe();
    const created = await this.create(definition, options.scan);
    const sessions = new Map<string, RuntimeTargetMessage[]>();
    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const eventPollIntervalMs =
      options.eventPollIntervalMs ?? DEFAULT_RUNTIME_EVENT_POLL_INTERVAL_MS;
    const eventConcurrency = Math.max(
      1,
      Math.min(
        Math.floor(
          options.eventConcurrency ?? DEFAULT_RUNTIME_EVENT_CONCURRENCY
        ),
        16
      )
    );
    const workerStallTimeoutMs = Math.max(
      60_000,
      options.workerStallTimeoutMs ?? DEFAULT_RUNTIME_WORKER_STALL_TIMEOUT_MS
    );
    const inFlight = new Map<string, Promise<void>>();
    const sessionTails = new Map<string, Promise<void>>();
    let executionError: unknown;

    const scheduleEvent = (event: RuntimeScanEvent): void => {
      const previous = sessionTails.get(event.sessionId) ?? Promise.resolve();
      const execution = previous
        .catch(() => undefined)
        .then(async () => {
          await options.onEvent?.(event);
          await this.executeEvent(
            target,
            sessions,
            created.runtimeScanId,
            event,
            options.signal
          );
        });
      sessionTails.set(event.sessionId, execution);
      const tracked = execution
        .catch((error: unknown) => {
          executionError ??= error;
        })
        .finally(() => {
          inFlight.delete(event.id);
          if (sessionTails.get(event.sessionId) === execution) {
            sessionTails.delete(event.sessionId);
          }
        });
      inFlight.set(event.id, tracked);
    };

    try {
      while (true) {
        this.ensureRunnerActive(
          created.runtimeScanId,
          startedAt,
          timeoutMs,
          options.signal
        );

        let claimedEvent = false;
        while (inFlight.size < eventConcurrency) {
          const event = await this.claimNext(
            created.runtimeScanId,
            options.signal
          );
          if (!event) {
            break;
          }
          claimedEvent = true;
          scheduleEvent(event);
        }

        if (executionError) {
          throw executionError;
        }

        const scan = await this.get(created.runtimeScanId, options.signal);
        this.ensureWorkerActive(scan, workerStallTimeoutMs);
        await options.onPoll?.(scan);
        const terminalResult = this.getTerminalResult(
          created.runtimeScanId,
          scan
        );
        if (terminalResult) {
          return terminalResult;
        }
        if (!claimedEvent) {
          if (inFlight.size > 0) {
            await Promise.race([
              ...inFlight.values(),
              sleep(eventPollIntervalMs, options.signal),
            ]);
          } else {
            await sleep(eventPollIntervalMs, options.signal);
          }
        }
      }
    } catch (error) {
      if (
        error instanceof ZeroLeaksAbortError ||
        error instanceof ZeroLeaksTimeoutError
      ) {
        await this.cancel(created.runtimeScanId).catch(() => undefined);
      }
      throw error;
    }
  }
}

class SkillScansApi {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  create(
    input: CreateSkillScanRequest
  ): Promise<CreateSkillScanResponse | Record<string, unknown>> {
    return this.transport.request("/api/v1/skill-scans", {
      method: "POST",
      body: input,
      timeoutMs:
        input.delivery === "sync"
          ? (input.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS)
          : undefined,
    });
  }

  uploadArchive(
    archive: Blob | ArrayBuffer | Uint8Array,
    options: ArchiveScanOptions = {}
  ): Promise<CreateSkillScanResponse | Record<string, unknown>> {
    const formData = new FormData();
    const blobPart =
      archive instanceof Uint8Array ? Uint8Array.from(archive).buffer : archive;
    const blob = archive instanceof Blob ? archive : new Blob([blobPart]);
    formData.set("archive", blob, options.fileName ?? "skill.zip");

    for (const [key, value] of Object.entries(options)) {
      if (key !== "fileName" && value !== undefined) {
        formData.set(key, String(value));
      }
    }

    return this.transport.request("/api/v1/skill-scans", {
      method: "POST",
      formData,
      timeoutMs:
        options.delivery === "sync"
          ? (options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS)
          : undefined,
    });
  }

  get(scanId: string, signal?: AbortSignal): Promise<SkillScanResult> {
    return this.transport.request(`/api/v1/skill-scans/${scanId}`, { signal });
  }

  list(limit?: number): Promise<SkillScanListResponse> {
    return this.transport.request("/api/v1/skill-scans", {
      query: { limit },
    });
  }

  async wait(
    scanId: string,
    options: WaitOptions<SkillScanResult> = {}
  ): Promise<SkillScanResult> {
    return await waitForScan(
      () => this.get(scanId, options.signal),
      (result) => result.status,
      `Timed out waiting for skill scan ${scanId}`,
      options
    );
  }

  async run(
    input: Omit<CreateSkillScanRequest, "delivery">,
    options: WaitOptions<SkillScanResult> = {}
  ): Promise<SkillScanResult> {
    const created = (await this.create({
      ...input,
      delivery: "async",
    })) as CreateSkillScanResponse;
    const result = await this.wait(created.scanId, options);
    if (result.status !== "completed") {
      throw new ZeroLeaksScanError(
        created.scanId,
        `Skill scan ended with status ${result.status}`,
        result
      );
    }
    return result;
  }
}

class HealthApi {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  check(): Promise<HealthResponse> {
    return this.transport.request("/api/v1/health", {
      authenticated: false,
    });
  }
}

class CapabilitiesApi {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  get(): Promise<CapabilitiesResponse> {
    return this.transport.request("/api/v1/capabilities", {
      authenticated: false,
    });
  }
}

export class ZeroLeaks {
  readonly scans: ScansApi;
  readonly reports: ReportsApi;
  readonly agentConfigs: AgentConfigsApi;
  readonly agentScans: AgentScansApi;
  readonly endpointConfigs: AgentConfigsApi;
  readonly endpointScans: AgentScansApi;
  readonly runtimeScans: RuntimeScansApi;
  readonly skillScans: SkillScansApi;
  readonly health: HealthApi;
  readonly capabilities: CapabilitiesApi;

  constructor(options: ZeroLeaksOptions = {}) {
    const transport = new Transport(options);
    this.reports = new ReportsApi(transport);
    this.scans = new ScansApi(transport, this.reports);
    this.agentConfigs = new AgentConfigsApi(transport);
    this.agentScans = new AgentScansApi(transport);
    this.endpointConfigs = this.agentConfigs;
    this.endpointScans = this.agentScans;
    this.runtimeScans = new RuntimeScansApi(transport);
    this.skillScans = new SkillScansApi(transport);
    this.health = new HealthApi(transport);
    this.capabilities = new CapabilitiesApi(transport);
  }
}

export const createZeroLeaks = (options: ZeroLeaksOptions = {}): ZeroLeaks =>
  new ZeroLeaks(options);
