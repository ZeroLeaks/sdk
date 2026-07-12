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
  description: string;
}

export type AgentAuthMethod = "none" | "bearer" | "api_key" | "custom_header";

export interface AgentRequestFormat {
  method: "POST" | "GET";
  bodyTemplate?: string;
  messageField?: string;
  responseField?: string;
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
  limits: {
    minimumSystemPromptCharacters: number;
    maximumAdaptiveCandidates: number;
    maximumSkillArchiveBytes: number;
  };
}
