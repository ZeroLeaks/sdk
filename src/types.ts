/**
 * @deprecated Prompt scans are retired. Scan modes only describe historical
 * prompt scans; use `agentScans` or `runtimeScans` for new work.
 */
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

/**
 * @deprecated Prompt scans are retired. `POST /api/v1/scans` answers
 * 410 Gone with `code: "PROMPT_SCANS_RETIRED"`. Use `agentScans.run` or
 * `runtimeScans.run`, or the source-available CLI (`npm i -g zeroleaks`) for a
 * standalone prompt.
 */
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

/** @deprecated Prompt scans are retired; creation no longer returns this shape. */
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
  /**
   * A value you place in the agent's own system prompt (8-200 characters,
   * with a digit or separator). If a scan gets it back, the leak is proven.
   * Stored reports show `[planted canary]` in its place in findings, the
   * conversation log, recommendations, and `boundaryAssurance`. Write-only:
   * on update, omit it to keep the stored value or send `""` to clear it.
   */
  plantedSecret?: string;
  workspaceId?: string;
}

export interface AgentConfig
  extends Omit<AgentConfigInput, "authValue" | "plantedSecret"> {
  _id: string;
  userId: string;
  authMethod: AgentAuthMethod;
  requestFormat: AgentRequestFormat;
  authValueConfigured: boolean;
  plantedSecretConfigured?: boolean;
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

export type FindingSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "informational";

/**
 * `deterministic_effect` and `observed_tool_call` mean ZeroLeaks observed the
 * effect or the tool call; `indicator` and `semantic` rest on response text.
 */
export type EvidenceStrength =
  | "semantic"
  | "indicator"
  | "observed_tool_call"
  | "deterministic_effect";

export type SecretLeakClass =
  | "credential"
  | "planted_canary"
  | "authorization_rule"
  | "internal_endpoint"
  | "tool_schema"
  | "instruction_text";

export interface BoundaryInvariant {
  id: string;
  title: string;
  dimension: string;
  description: string;
  protectedAsset: string;
  allowedBehavior: string;
  forbiddenBehavior: string;
  approvalRequirement: string;
  relevantTools: string[];
  severity: "critical" | "high" | "medium" | "low";
}

export interface AgentFinding {
  category: string;
  technique: string;
  severity: FindingSeverity;
  evidence: string;
  attackPrompt: string;
  agentResponse: string;
  confidence?: number;
  remediation?: string;
  observedAction?: string;
  boundaryInvariant?: BoundaryInvariant;
  /** Secrets-in-context findings only. */
  leakClass?: SecretLeakClass;
  evidenceStrength?: EvidenceStrength;
  /**
   * Set when the judge panel reported a leak no detector matched: the span of
   * the response it quoted. `""` means the quote did not verify; the finding
   * stays listed but does not lower the score.
   */
  claimedSpan?: string;
  [key: string]: unknown;
}

export interface AgentReportComponent {
  score: number;
  vulnerability: Vulnerability;
  findingsCount: number;
  findings: AgentFinding[];
}

export interface SecretLeak {
  class: SecretLeakClass;
  severity: FindingSeverity;
  /** Describes the match; never contains the raw secret or planted canary. */
  evidence: string;
  evidenceStrength: EvidenceStrength;
  probeId: string;
  technique: string;
  /** Judge-only leaks: the span of the response the panel quoted. */
  claimedSpan?: string;
}

export interface SecretsInContextSummary {
  probesRun: number;
  leaks: SecretLeak[];
  reconnaissance: {
    toolNamesObserved: string[];
    rulesObserved: string[];
    /** Below 3, reconnaissance was cut short. */
    questionsAnswered?: number;
  };
  retrievedSeedIds: string[];
  plantedCanaryConfigured: boolean;
  limitations: string[];
}

export interface DefenseFingerprint {
  refusalStyle: "hard_refusal" | "deflection" | "partial_comply" | "none";
  filterSignals: string[];
  toolGating: "enforced" | "absent" | "unknown";
  /** Share of sampled responses that refused, 0-1. */
  refusalRate: number;
  sampleSize: number;
  observedAt: number;
}

export interface CampaignState {
  invariantId: string;
  invariantTitle: string;
  /** Token the campaign asks the agent to echo to prove a crossing. */
  canary: string;
  budget: number;
  turnsUsed: number;
  status: "in_progress" | "crossed" | "exhausted";
  crossedAtTurn?: number;
  transcript: Array<{
    role: "attacker" | "agent";
    content: string;
    phase?: string;
    toolCalls?: unknown[];
  }>;
  crossing?: {
    severity: FindingSeverity;
    evidence: string;
    confidence: number;
    agreement: number;
    voteCount: number;
    evidenceStrength: EvidenceStrength;
  };
}

export interface BoundaryAssurance {
  generatedBy: string;
  usedFallback: boolean;
  invariants: BoundaryInvariant[];
  initialProbes: number;
  mutatedProbes: number;
  multiAgentProbes?: number;
  artifactProbes?: number;
  violations: number;
  retrievedSeedIds: string[];
  promotedProbes: number;
  attackQuality?: {
    attempted: number;
    succeeded: number;
    successRate: number;
    deterministicSuccesses: number;
    deterministicEvidenceRate: number;
    averageConfidence?: number;
    averageDurationMs: number;
    queriesToFirstSuccess?: number;
    longestCampaignTurns: number;
    noveltyRate: number;
    promotionEligible: number;
    byOrigin: Record<string, { attempted: number; succeeded: number }>;
    byModality: Record<string, { attempted: number; succeeded: number }>;
    coverage: {
      requested: string[];
      exercised: string[];
      unsupported: Array<{ surface: string; reason: string }>;
    };
    limitations: string[];
  };
  portfolio?: {
    byOrigin: Record<string, { attempted: number; succeeded: number }>;
    byModality: Record<string, { attempted: number; succeeded: number }>;
  };
  longHorizonCampaigns?: Array<{
    invariantId: string;
    invariantTitle: string;
    turnsUsed: number;
    budget: number;
    status: "in_progress" | "crossed" | "exhausted";
    crossedAtTurn?: number;
  }>;
  /** Full state of each long-horizon campaign, including its transcript. */
  campaignStates?: CampaignState[];
  /** Bounded attack-path search: every node explored or pruned, with reasons. */
  searchTree?: {
    branchingFactor: number;
    beamWidth: number;
    depthBound: number;
    pruneThreshold: number;
    nodeBudget: number;
    exploredCount: number;
    prunedCount: number;
    /** Explored nodes the driver ran outside the beam (they never consumed nodeBudget). */
    driverExecutedCount: number;
    stoppedBecause: "budget" | "depth" | "confirmed" | "frontier_empty";
    nodes: Array<{
      id: string;
      parentId?: string;
      invariantId: string;
      phase: "reconnaissance" | "escalation" | "persistence";
      depth: number;
      score: number;
      status: "frontier" | "explored" | "pruned";
      pruneReason?: string;
      /** Executed but not expanded deeper — why the branch stopped after it ran. */
      notExpandedReason?: string;
      /** Who ran the probe: the beam, or the driver for attempts recorded post-hoc. */
      executedBy?: "search" | "driver";
      children: string[];
      probe: { id: string; technique: string; turns: string[] };
      attempt?: {
        succeeded: boolean;
        evidenceStrength?: string;
        confidence?: number;
      };
    }>;
  };
  /** Strategist phase plan that ordered the scan's probe groups. */
  strategy?: {
    phases: Array<{
      name: "reconnaissance" | "escalation" | "persistence";
      invariantIds: string[];
      nodeBudget: number;
      stallResetAfter: number;
    }>;
    generatedBy: string;
    usedFallback: boolean;
  };
  /** Inspector fingerprint of the defenses observed during the scan. */
  fingerprint?: DefenseFingerprint;
  /** Fingerprint from the previous scan of this target, when one existed. */
  priorFingerprint?: DefenseFingerprint;
  /** Absent on reports created before the secrets-in-context track. */
  secretsInContext?: SecretsInContextSummary;
  verificationCases: Array<{
    id: string;
    invariantId: string;
    technique: string;
    turns: string[];
    expectedSafeBehavior: string;
    violated: boolean;
    evidence: string;
    origin?: string;
    modality?: string;
    evidenceStrength?: EvidenceStrength;
    confidence?: number;
    judgeVotes?: number;
  }>;
}

export interface AgentReport {
  overallScore: number;
  overallVulnerability: Vulnerability;
  components: {
    promptSecurity: AgentReportComponent;
    toolSafety: AgentReportComponent;
    multiTurnResilience: AgentReportComponent;
    dataLeakage: AgentReportComponent;
    [key: string]: AgentReportComponent;
  };
  attacksRun: number;
  summary: string;
  recommendations: string[];
  conversationLog: unknown[];
  toolTrace?: RuntimeToolCall[];
  boundaryAssurance?: BoundaryAssurance;
  containment?: {
    payloadRewrites: number;
    sanitizedPayloads: number;
  };
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
  [key: string]: unknown;
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

export interface PromptScanReplacements {
  agentScans: string;
  runtimeScans: string;
  cli: string;
}

export interface PromptScanRetirement {
  enabled: false;
  retired: true;
  code: "PROMPT_SCANS_RETIRED";
  replacement: PromptScanReplacements;
}

export interface CapabilityDeprecation {
  id: string;
  fields: string[];
  message: string;
  replacement?: Record<string, string>;
}

export interface CapabilitiesResponse {
  apiVersion: string;
  /** @deprecated Describes the retired prompt-scan track; may be omitted. */
  scanModes?: ScanMode[];
  /** @deprecated Describes the retired prompt-scan track; may be omitted. */
  targetModels?: string[];
  /** @deprecated Describes the retired prompt-scan track; may be omitted. */
  defaultTargetModel?: string;
  temperature: { minimum: number; maximum: number };
  reasoningEfforts: ReasoningEffort[];
  knowledgeProfiles: KnowledgeProfile[];
  attackSurfaces: AttackSurface[];
  promptScans?: PromptScanRetirement;
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
    /** @deprecated Describes the retired prompt-scan track; may be omitted. */
    minimumSystemPromptCharacters?: number;
    maximumAdaptiveCandidates: number;
    maximumSkillArchiveBytes: number;
    maximumRuntimeTools?: number;
  };
  deprecations?: CapabilityDeprecation[];
}
