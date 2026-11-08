/**
 * Tool containment for runtime scans.
 *
 * A runtime scan runs your agent in your own process, so its tools are your
 * real tools. Containment sits between the agent and those tools for the
 * duration of the scan: read-only calls run normally, while calls that would
 * change something (delete, write, send, pay, run a command) or reach a host
 * outside your allowlist return a simulated result instead. The call and its
 * arguments still land in the scan trace, so a probe that talked the agent
 * into a destructive action is reported as a finding; the action just never
 * happens.
 *
 * Containment is on by default for every adapter in this package. Pass
 * `containment: false` to run tools for real (for example against a staging
 * environment), or a policy object to tune it.
 */

export interface ToolContainmentPolicy {
  /** Tool names that always run for real, even if they look side-effecting. */
  allowTools?: string[];
  /** Tool names that are always simulated. */
  simulateTools?: string[];
  /**
   * Hosts a tool argument may point at. URLs and email addresses for any
   * other host are treated as egress and simulated. Subdomains match.
   */
  allowedHosts?: string[];
}

/** `true` (default) uses the built-in policy; `false` disables containment. */
export type ToolContainmentOption = boolean | ToolContainmentPolicy;

export type ToolContainmentCategory =
  | "allowed"
  | "side_effect"
  | "egress"
  | "policy";

export interface ToolContainmentDecision {
  contained: boolean;
  category: ToolContainmentCategory;
  reason: string;
}

/** What a contained tool call returns to the agent in place of a real result. */
export interface SimulatedToolResult {
  status: "ok";
  simulated: true;
  tool: string;
  note: string;
}

// Verbs that name a change to the world. Matched against the tool name split
// into words, so `deleteUser`, `delete_user`, and `user-delete` all match while
// `deleted_items_report` does not.
const SIDE_EFFECT_VERBS = new Set([
  "add",
  "append",
  "approve",
  "archive",
  "assign",
  "ban",
  "buy",
  "cancel",
  "charge",
  "chmod",
  "commit",
  "create",
  "delete",
  "deploy",
  "destroy",
  "disable",
  "drop",
  "enable",
  "erase",
  "exec",
  "execute",
  "grant",
  "insert",
  "invite",
  "kill",
  "merge",
  "modify",
  "move",
  "mutate",
  "patch",
  "pay",
  "post",
  "publish",
  "purchase",
  "purge",
  "push",
  "put",
  "refund",
  "reject",
  "remove",
  "rename",
  "reset",
  "restart",
  "revoke",
  "rm",
  "run",
  "save",
  "schedule",
  "send",
  "set",
  "shell",
  "shutdown",
  "submit",
  "terminate",
  "transfer",
  "truncate",
  "unlink",
  "update",
  "upload",
  "upsert",
  "wipe",
  "withdraw",
  "write",
]);

// A name that opens with one of these reads state, whatever follows it:
// `get_refund_status` looks up a refund, it does not issue one.
const READ_VERBS = new Set([
  "check",
  "count",
  "describe",
  "fetch",
  "find",
  "get",
  "inspect",
  "list",
  "lookup",
  "query",
  "read",
  "search",
  "show",
  "view",
]);

const URL_PATTERN = /\bhttps?:\/\/[^\s"'`<>)\]}]+/gi;
const EMAIL_PATTERN = /\b[\w.%+-]+@([a-z0-9.-]+\.[a-z]{2,})\b/gi;
const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/g;
const WORD_SEPARATOR = /[^a-z0-9]+/;

// Destinations that can never leave the machine or that ZeroLeaks owns.
// `.invalid` is reserved (RFC 2606): the scan's canary sinks live there.
const ALWAYS_ALLOWED_HOST_SUFFIXES = [".invalid", ".localhost"];
const ALWAYS_ALLOWED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
]);

const toolWords = (name: string): string[] =>
  name
    .replace(CAMEL_BOUNDARY, "$1 $2")
    .toLowerCase()
    .split(WORD_SEPARATOR)
    .filter(Boolean);

const collectStrings = (value: unknown, out: string[], depth = 0): void => {
  if (depth > 8) {
    return;
  }
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, out, depth + 1);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectStrings(item, out, depth + 1);
    }
  }
};

const TRAILING_DOT = /\.$/;

const hostAllowed = (host: string, allowedHosts: string[]): boolean => {
  const normalized = host.toLowerCase().replace(TRAILING_DOT, "");
  if (
    ALWAYS_ALLOWED_HOSTS.has(normalized) ||
    ALWAYS_ALLOWED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  ) {
    return true;
  }
  return allowedHosts.some((allowed) => {
    const candidate = allowed.toLowerCase().replace(TRAILING_DOT, "");
    return normalized === candidate || normalized.endsWith(`.${candidate}`);
  });
};

const urlHost = (raw: string): string | undefined => {
  try {
    return new URL(raw).hostname;
  } catch {
    return;
  }
};

/** The first destination in the arguments that is outside the allowlist. */
export const findExternalDestination = (
  args: unknown,
  allowedHosts: string[] = []
): string | undefined => {
  const strings: string[] = [];
  collectStrings(args, strings);
  for (const text of strings) {
    for (const match of text.matchAll(URL_PATTERN)) {
      const host = urlHost(match[0]);
      if (host && !hostAllowed(host, allowedHosts)) {
        return host;
      }
    }
    for (const match of text.matchAll(EMAIL_PATTERN)) {
      const host = match[1];
      if (host && !hostAllowed(host, allowedHosts)) {
        return host;
      }
    }
  }
  return;
};

/** Normalize the public option into a policy, or `null` when disabled. */
export const resolveToolContainment = (
  option: ToolContainmentOption | undefined
): ToolContainmentPolicy | null => {
  if (option === false) {
    return null;
  }
  if (option === undefined || option === true) {
    return {};
  }
  return option;
};

/**
 * Decide whether a tool call runs for real. Explicit allow and simulate lists
 * win; otherwise a side-effecting tool name or an argument that points at an
 * outside host is contained.
 */
export const decideToolContainment = (
  toolName: string,
  args: unknown,
  policy: ToolContainmentPolicy = {}
): ToolContainmentDecision => {
  if (policy.simulateTools?.includes(toolName)) {
    return {
      contained: true,
      category: "policy",
      reason: "listed in simulateTools",
    };
  }
  if (policy.allowTools?.includes(toolName)) {
    return {
      contained: false,
      category: "allowed",
      reason: "listed in allowTools",
    };
  }
  const words = toolWords(toolName);
  const startsWithRead = READ_VERBS.has(words[0] ?? "");
  const verb = startsWithRead
    ? undefined
    : words.find((word) => SIDE_EFFECT_VERBS.has(word));
  if (verb) {
    return {
      contained: true,
      category: "side_effect",
      reason: `"${verb}" names a side effect`,
    };
  }
  const destination = findExternalDestination(args, policy.allowedHosts);
  if (destination) {
    return {
      contained: true,
      category: "egress",
      reason: `argument reaches ${destination}, which is not in allowedHosts`,
    };
  }
  return { contained: false, category: "allowed", reason: "read-only call" };
};

export const simulatedToolResult = (
  toolName: string,
  decision: ToolContainmentDecision
): SimulatedToolResult => ({
  status: "ok",
  simulated: true,
  tool: toolName,
  note: `ZeroLeaks contained this call during a runtime scan (${decision.reason}). It was recorded but not executed.`,
});

/**
 * Run one tool call through containment. `execute` is only called when the
 * policy lets the call through.
 */
export const runContainedTool = async <Result>(
  toolName: string,
  args: unknown,
  execute: () => Promise<Result> | Result,
  policy: ToolContainmentPolicy | null
): Promise<Result | SimulatedToolResult> => {
  if (!policy) {
    return await execute();
  }
  const decision = decideToolContainment(toolName, args, policy);
  if (decision.contained) {
    return simulatedToolResult(toolName, decision);
  }
  return await execute();
};

export const isSimulatedToolResult = (
  value: unknown
): value is SimulatedToolResult =>
  Boolean(
    value &&
      typeof value === "object" &&
      (value as { simulated?: unknown }).simulated === true &&
      typeof (value as { tool?: unknown }).tool === "string"
  );

/** Describe the active policy in target metadata so the report can show it. */
export const describeToolContainment = (
  policy: ToolContainmentPolicy | null
): {
  enabled: boolean;
  allowTools?: string[];
  simulateTools?: string[];
  allowedHosts?: string[];
} =>
  policy
    ? {
        enabled: true,
        allowTools: policy.allowTools,
        simulateTools: policy.simulateTools,
        allowedHosts: policy.allowedHosts,
      }
    : { enabled: false };
