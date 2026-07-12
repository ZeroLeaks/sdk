export type ScanMode = "extraction" | "injection" | "dual" | "sandbox" | "full";

export type ScanStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "canceled";

export type Vulnerability = "critical" | "high" | "medium" | "low" | "secure";

export type ReasoningEffort = "low" | "medium" | "high";
export type KnowledgeProfile = "baseline" | "production" | "research";
export type RuntimeScanMode = "full" | "quick";
export type AttackSurface =
  | "direct_chat"
  | "indirect_content"
  | "tool_calling"
  | "mcp"
  | "repo_ci"
  | "rag_vector"
  | "multi_turn";

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: unknown;
  [key: string]: unknown;
}

export interface CreateScanRequest {
  systemPrompt: string;
  scanMode?: ScanMode;
  targetModel?: string;
  temperature?: number;
  reasoningEffort?: ReasoningEffort;
  knowledgeProfile?: KnowledgeProfile;
  attackSurfaces?: AttackSurface[];
  usePineconeKnowledge?: boolean;
  maxAdaptiveCandidates?: number;
  userTools?: ToolDefinition[];
  autoDetectTools?: boolean;
  sandboxScanType?: "both" | "extraction" | "injection";
  workspaceId?: string;
}

export interface CreateScanResponse {
  scanId: string;
  userId: string;
  status: ScanStatus;
  message?: string;
  processingMethod: "workflow";
  workflowRunId?: string;
  scanMode: ScanMode;
  knowledgeProfile: KnowledgeProfile;
}

export interface Scan {
  id: string;
  status: ScanStatus;
  source: string;
  targetModel?: string;
  createdAt: number;
  completedAt?: number;
  workflowRunId?: string;
  currentTurn?: number;
  maxTurns?: number;
  extractionTurn?: number;
  extractionMaxTurns?: number;
  injectionTurn?: number;
  injectionMaxTurns?: number;
  sandboxTurn?: number;
  sandboxMaxTurns?: number;
  progressStatus?: string;
  lastActiveAt?: number;
}

export interface ScanReport {
  id?: string;
  _id?: string;
  scanId?: string;
  overallScore: number;
  overallVulnerability: Vulnerability;
  findings: unknown[];
  attacksRun: number;
  turnsUsed?: number;
  extractionFound: boolean;
  summary: string;
  recommendations: unknown[];
  conversationLog?: unknown[];
  injectionResults?: unknown[];
  injectionScore?: number;
  injectionVulnerability?: Vulnerability;
  scanModes?: string[];
  sandboxToolLog?: unknown[];
  canariesExposed?: string[];
  killChainsDetected?: string[];
  promptRemediation?: unknown;
  hardeningValidation?: unknown;
  createdAt: number;
  [key: string]: unknown;
}

export interface ScanResult {
  scan: Scan;
  report: ScanReport | null;
}

export interface ScanListItem {
  id: string;
  status: ScanStatus;
  source: string;
  targetModel?: string;
  createdAt: number;
  completedAt?: number;
  overallScore?: number;
  overallVulnerability?: Vulnerability;
  extractionFound?: boolean;
}

export interface ScanListResponse {
  items: ScanListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ReportListItem {
  id?: string;
  scanId: string;
  status: ScanStatus;
  overallScore?: number;
  overallVulnerability?: Vulnerability;
  extractionFound?: boolean;
  injectionScore?: number;
  injectionVulnerability?: Vulnerability;
  scanModes?: string[];
  source: string;
  targetModel?: string;
  createdAt: number;
  completedAt?: number;
}

export interface ReportListResponse {
  items: ReportListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ListOptions {
  cursor?: string;
  limit?: number;
  workspaceId?: string;
}

export interface WaitOptions<T> {
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onPoll?: (value: T) => void | Promise<void>;
}

export interface AgentTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  strict?: boolean;
  type?: string;
  providerOptions?: unknown;
  definition?: unknown;
  [key: string]: unknown;
}

export type AgentAuthMethod = "none" | "bearer" | "api_key" | "custom_header";

export interface AgentRequestFormat {
  method: "POST" | "GET";
  headers?: Record<string, string>;
  bodyTemplate?: string;
  messageField?: string;
  messagesField?: string;
  sessionField?: string;
  responseField?: string;
  toolCallsField?: string;
  finishReasonField?: string;
  usageField?: string;
}

export interface AgentConfigInput {
  name: string;
  endpointUrl: string;
  authMethod?: AgentAuthMethod;
  authValue?: string;
  authHeaderName?: string;
  requestFormat?: AgentRequestFormat;
  description?: string;
  tools?: AgentTool[];
  workspaceId?: string;
}

export interface AgentConfig extends Omit<AgentConfigInput, "authValue"> {
  _id: string;
  userId: string;
  authMethod: AgentAuthMethod;
  requestFormat: AgentRequestFormat;
  authValueConfigured: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AgentConfigListResponse {
  configs: AgentConfig[];
}

export interface AgentScan {
  _id: string;
  userId: string;
  agentConfigId: string;
  status: ScanStatus;
  createdAt: number;
  completedAt?: number;
  currentPhase?: string;
  workflowRunId?: string;
}

export interface AgentReport {
  overallScore: number;
  overallVulnerability: Vulnerability;
  components: Record<string, unknown>;
  attacksRun: number;
  summary: string;
  recommendations: string[];
  conversationLog: unknown[];
  toolTrace?: RuntimeToolCall[];
  target?: RuntimeTargetDefinition;
  createdAt: number;
  [key: string]: unknown;
}

export interface AgentScanResult {
  scan: AgentScan;
  config: AgentConfig | null;
  report: AgentReport | null;
}

export interface AgentScanListItem {
  id: string;
  status: ScanStatus;
  currentPhase?: string;
  agentConfigId: string;
  agentName: string;
  endpointUrl: string;
  overallScore?: number;
  overallVulnerability?: Vulnerability;
  createdAt: number;
  completedAt?: number;
}

export interface AgentScanListResponse {
  scans: AgentScanListItem[];
}

export type EndpointTool = AgentTool;
export type EndpointAuthMethod = AgentAuthMethod;
export type EndpointRequestFormat = AgentRequestFormat;
export type EndpointConfigInput = AgentConfigInput;
export type EndpointConfig = AgentConfig;
export type EndpointScan = AgentScan;
export type EndpointReport = AgentReport;
export type EndpointScanResult = AgentScanResult;

export type RuntimeMessageRole =
  | "assistant"
  | "developer"
  | "system"
  | "tool"
  | "user";

export interface RuntimeTargetMessage {
  role: RuntimeMessageRole | string;
  content: unknown;
  name?: string;
  toolCallId?: string;
  [key: string]: unknown;
}

export interface RuntimeToolCall {
  id?: string;
  name: string;
  arguments?: unknown;
  result?: unknown;
  error?: string;
  providerExecuted?: boolean;
}

export interface RuntimeTargetDefinition {
  name: string;
  provider: string;
  model?: string;
  instructions?: unknown;
  tools?: AgentTool[];
  metadata?: unknown;
}

export interface RuntimeTargetInvocation {
  runtimeScanId: string;
  eventId: string;
  sessionId: string;
  message: string;
  messages: RuntimeTargetMessage[];
  signal?: AbortSignal;
}

export interface RuntimeTargetResponse {
  text: string;
  toolCalls?: RuntimeToolCall[];
  finishReason?: string;
  usage?: unknown;
  metadata?: unknown;
  messages?: RuntimeTargetMessage[];
}

export interface RuntimeScanTarget {
  describe: () => Promise<RuntimeTargetDefinition> | RuntimeTargetDefinition;
  invoke: (
    invocation: RuntimeTargetInvocation
  ) => Promise<RuntimeTargetResponse | string> | RuntimeTargetResponse | string;
  reset?: (sessionId: string) => Promise<void> | void;
}

export interface RuntimeScanOptions {
  workspaceId?: string;
  scanMode?: RuntimeScanMode;
  targetModel?: string;
  temperature?: number;
  reasoningEffort?: ReasoningEffort;
  knowledgeProfile?: KnowledgeProfile;
  attackSurfaces?: AttackSurface[];
  usePineconeKnowledge?: boolean;
  maxAdaptiveCandidates?: number;
}

export interface CreateRuntimeScanResponse {
  runtimeScanId: string;
  workflowRunId: string;
  status: ScanStatus;
  processingMethod: "sdk-relay";
}

export interface RuntimeScan {
  _id: string;
  status: ScanStatus;
  target: RuntimeTargetDefinition;
  options?: RuntimeScanOptions;
  currentPhase?: string;
  workflowRunId?: string;
  report?: AgentReport;
  error?: string;
  runnerLastSeenAt?: number;
  workerLastSeenAt?: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface RuntimeScanListResponse {
  scans: RuntimeScan[];
}

export interface RuntimeScanEvent {
  id: string;
  kind: "invoke" | "reset";
  sessionId: string;
  message?: string;
  claimToken: string;
}

export interface RuntimeRunOptions extends WaitOptions<RuntimeScan> {
  eventConcurrency?: number;
  eventPollIntervalMs?: number;
  workerStallTimeoutMs?: number;
  onEvent?: (event: RuntimeScanEvent) => void | Promise<void>;
  scan?: RuntimeScanOptions;
}

export type SkillScanMode = "review" | "risk" | "behavior" | "full";
export type SkillToolProfile = "readonly" | "standard" | "networked";

export interface CreateSkillScanRequest {
  source: string;
  skill?: string;
  delivery?: "async" | "sync";
  webhookUrl?: string;
  webhookSecret?: string;
  model?: string;
  behaviorModel?: string;
  maxFiles?: number;
  maxBytes?: number;
  toolProfile?: SkillToolProfile;
  mode?: SkillScanMode;
  behaviorTrials?: number;
  behaviorAdaptiveLimit?: number;
  includeAssets?: boolean;
  timeoutMs?: number;
}

export interface CreateSkillScanResponse {
  scanId: string;
  status: ScanStatus;
  pollUrl: string;
  processingMethod: "workflow";
}

export interface SkillScanResult {
  scanId: string;
  status: ScanStatus;
  source: string;
  skill?: string;
  inputKind: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  report?: unknown;
  webhook?: {
    url: string;
    attempts: number;
    deliveredAt?: number;
    lastStatusCode?: number;
    lastError?: string;
  } | null;
}

export interface SkillScanListResponse {
  scans: Omit<SkillScanResult, "report" | "webhook">[];
}

export interface ArchiveScanOptions
  extends Omit<CreateSkillScanRequest, "source"> {
  fileName?: string;
}

export interface HealthResponse {
  ok?: boolean;
  status?: string;
  [key: string]: unknown;
}

export interface CapabilitiesResponse {
  apiVersion: string;
  scanModes: ScanMode[];
  targetModels: string[];
  defaultTargetModel: string;
  temperature: { minimum: number; maximum: number };
  reasoningEfforts: ReasoningEffort[];
  knowledgeProfiles: KnowledgeProfile[];
  attackSurfaces: AttackSurface[];
  runtimeScans?: {
    enabled: boolean;
    adapters: string[];
    fullToolDefinitions: boolean;
    toolExecutionTracing: boolean;
    sessionReset: boolean;
  };
  endpointScans?: {
    enabled: boolean;
    compatibilityAliases: string[];
  };
  limits: {
    minimumSystemPromptCharacters: number;
    maximumAdaptiveCandidates: number;
    maximumSkillArchiveBytes: number;
    maximumRuntimeTools?: number;
  };
}
