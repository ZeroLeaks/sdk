import type {
  Agent,
  FlexibleSchema,
  Output,
  ToolLoopAgentSettings,
  ToolSet,
} from "ai";
import { asSchema, ToolLoopAgent } from "ai";
import {
  describeToolContainment,
  isSimulatedToolResult,
  resolveToolContainment,
  runContainedTool,
  type ToolContainmentOption,
  type ToolContainmentPolicy,
} from "./containment";
import type {
  AgentTool,
  RuntimeScanTarget,
  RuntimeTargetInvocation,
  RuntimeTargetMessage,
  RuntimeTargetResponse,
  RuntimeToolCall,
} from "./types";

/** AI SDK 7 bounds runtime context by this type but does not export it. */
type RuntimeContext = Record<string, unknown>;

export interface AISDKAgentTargetOptions<
  CALL_OPTIONS,
  TOOLS extends ToolSet,
  OUTPUT extends Output.Output,
  RUNTIME_CONTEXT extends RuntimeContext = RuntimeContext,
> {
  agent: Agent<CALL_OPTIONS, TOOLS, RUNTIME_CONTEXT, OUTPUT>;
  callOptions?: CALL_OPTIONS;
  /**
   * Whether the agent's tools were wrapped with `containTools` before the
   * agent was built. A prebuilt agent's tools can't be wrapped from here, so
   * this only labels the scan; it does not contain anything by itself.
   */
  containedTools?: boolean;
  instructions?: unknown;
  invocationMode?: "generate" | "stream";
  metadata?: unknown;
  model?: string;
  name?: string;
  provider?: string;
}

export type AISDKToolLoopTargetOptions<
  CALL_OPTIONS,
  TOOLS extends ToolSet,
  OUTPUT extends Output.Output,
  RUNTIME_CONTEXT extends RuntimeContext = RuntimeContext,
> = ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, RUNTIME_CONTEXT, OUTPUT> & {
  callOptions?: CALL_OPTIONS;
  /**
   * Simulate side-effecting and egress tool calls during the scan instead of
   * running them. On by default; pass `false` to run every tool for real.
   */
  containment?: ToolContainmentOption;
  invocationMode?: "generate" | "stream";
  metadata?: unknown;
  name?: string;
  provider?: string;
};

interface AgentExecutor {
  generate: (options: Record<string, unknown>) => PromiseLike<unknown>;
  id?: string;
  stream: (options: Record<string, unknown>) => PromiseLike<unknown>;
  tools: ToolSet;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;

const resolveValue = async (value: unknown): Promise<unknown> =>
  await Promise.resolve(value);

const serializableToolDefinition = (
  tool: Record<string, unknown>
): Record<string, unknown> => {
  const definition: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tool)) {
    if (
      key !== "execute" &&
      key !== "inputSchema" &&
      key !== "outputSchema" &&
      typeof value !== "function"
    ) {
      definition[key] = value;
    }
  }
  if (typeof tool.execute === "function") {
    definition.hasExecute = true;
  }
  if (typeof tool.needsApproval === "function") {
    definition.needsApproval = "dynamic";
  }
  return definition;
};

const wrapToolSet = <TOOLS extends ToolSet>(
  tools: TOOLS,
  policy: ToolContainmentPolicy | null
): TOOLS => {
  if (!policy) {
    return tools;
  }
  const wrapped: Record<string, unknown> = {};
  for (const [name, rawTool] of Object.entries(tools)) {
    const tool = rawTool as unknown as Record<string, unknown>;
    const execute = tool.execute;
    wrapped[name] =
      typeof execute === "function"
        ? {
            ...tool,
            execute: (input: unknown, context: unknown) =>
              runContainedTool(
                name,
                input,
                () =>
                  (execute as (a: unknown, b: unknown) => unknown)(
                    input,
                    context
                  ),
                policy
              ),
          }
        : tool;
  }
  return wrapped as TOOLS;
};

/**
 * Wrap an AI SDK tool set so side-effecting and egress calls return a
 * simulated result during a runtime scan. Use it when you build your own
 * agent and pass it to `aiSdk({ agent, containedTools: true })`; the
 * tool-loop form of `aiSdk` applies it for you.
 */
export const containTools = <TOOLS extends ToolSet>(
  tools: TOOLS,
  containment: ToolContainmentOption = true
): TOOLS => wrapToolSet(tools, resolveToolContainment(containment));

export const serializeAISDKTools = async (
  tools: ToolSet = {}
): Promise<AgentTool[]> => {
  const definitions: AgentTool[] = [];
  for (const [name, rawTool] of Object.entries(tools)) {
    const tool = rawTool as unknown as Record<string, unknown>;
    const inputSchema = tool.inputSchema
      ? await asSchema(tool.inputSchema as FlexibleSchema<unknown>).jsonSchema
      : undefined;
    const outputSchema = tool.outputSchema
      ? await asSchema(tool.outputSchema as FlexibleSchema<unknown>).jsonSchema
      : undefined;
    definitions.push({
      name,
      description:
        typeof tool.description === "string" ? tool.description : undefined,
      inputSchema,
      outputSchema,
      type: typeof tool.type === "string" ? tool.type : "function",
      providerOptions: tool.providerOptions,
      definition: serializableToolDefinition(tool),
    });
  }
  return definitions;
};

const normalizeToolTrace = async (
  result: Record<string, unknown>
): Promise<RuntimeToolCall[]> => {
  const stepsValue = await resolveValue(result.steps);
  const sources = [
    ...(Array.isArray(stepsValue)
      ? stepsValue.flatMap((step) => {
          const record = asRecord(step);
          return record ? [record] : [];
        })
      : []),
    result,
  ];
  const calls: unknown[] = [];
  const results: unknown[] = [];
  for (const source of sources) {
    const callsValue = await resolveValue(source.toolCalls);
    const resultsValue = await resolveValue(source.toolResults);
    if (Array.isArray(callsValue)) {
      calls.push(...callsValue);
    }
    if (Array.isArray(resultsValue)) {
      results.push(...resultsValue);
    }
  }
  const resultsById = new Map<string, Record<string, unknown>>();
  for (const item of results) {
    const record = asRecord(item);
    if (record && typeof record.toolCallId === "string") {
      resultsById.set(record.toolCallId, record);
    }
  }

  const seen = new Set<string>();
  return calls.flatMap((item) => {
    const call = asRecord(item);
    if (!call || typeof call.toolName !== "string") {
      return [];
    }
    const id =
      typeof call.toolCallId === "string" ? call.toolCallId : undefined;
    const identity = id ?? `${call.toolName}:${JSON.stringify(call.input)}`;
    if (seen.has(identity)) {
      return [];
    }
    seen.add(identity);
    const toolResult = id ? resultsById.get(id) : undefined;
    return [
      {
        id,
        name: call.toolName,
        arguments: call.input,
        result: toolResult?.output,
        contained: isSimulatedToolResult(toolResult?.output) || undefined,
        error:
          typeof toolResult?.error === "string" ? toolResult.error : undefined,
        providerExecuted:
          typeof call.providerExecuted === "boolean"
            ? call.providerExecuted
            : undefined,
      },
    ];
  });
};

const normalizeAgentResult = async (
  resultValue: unknown,
  inputMessages: RuntimeTargetMessage[]
): Promise<RuntimeTargetResponse> => {
  const result = asRecord(resultValue);
  if (!result) {
    throw new Error("AI SDK agent returned an invalid result");
  }
  const textValue = await resolveValue(result.text);
  const responseValue = await resolveValue(result.response);
  const response = asRecord(responseValue);
  const responseMessages = Array.isArray(response?.messages)
    ? (response.messages as RuntimeTargetMessage[])
    : [];
  const finishReasonValue = await resolveValue(result.finishReason);
  const usage = await resolveValue(result.usage);

  return {
    text: typeof textValue === "string" ? textValue : String(textValue ?? ""),
    toolCalls: await normalizeToolTrace(result),
    finishReason:
      typeof finishReasonValue === "string" ? finishReasonValue : undefined,
    usage,
    messages: [...inputMessages, ...responseMessages],
  };
};

const createTargetFromAgent = (
  agent: AgentExecutor,
  options: {
    callOptions?: unknown;
    containment: ReturnType<typeof describeToolContainment> | "unknown";
    instructions?: unknown;
    invocationMode?: "generate" | "stream";
    metadata?: unknown;
    model?: string;
    name?: string;
    provider?: string;
  }
): RuntimeScanTarget => ({
  describe: async () => ({
    name: options.name ?? agent.id ?? "AI SDK agent",
    provider: options.provider ?? "ai-sdk",
    model: options.model,
    instructions: options.instructions,
    tools: await serializeAISDKTools(agent.tools),
    metadata: {
      adapter: "ai-sdk",
      invocationMode: options.invocationMode ?? "generate",
      containment: options.containment,
      ...asRecord(options.metadata),
    },
  }),
  invoke: async (invocation: RuntimeTargetInvocation) => {
    const call: Record<string, unknown> = {
      messages: invocation.messages,
      abortSignal: invocation.signal,
    };
    if (options.callOptions !== undefined) {
      call.options = options.callOptions;
    }
    const result =
      options.invocationMode === "stream"
        ? await agent.stream(call)
        : await agent.generate(call);
    return await normalizeAgentResult(result, invocation.messages);
  },
});

export const createAISDKAgentTarget = <
  CALL_OPTIONS,
  TOOLS extends ToolSet,
  OUTPUT extends Output.Output,
  RUNTIME_CONTEXT extends RuntimeContext = RuntimeContext,
>(
  options: AISDKAgentTargetOptions<CALL_OPTIONS, TOOLS, OUTPUT, RUNTIME_CONTEXT>
): RuntimeScanTarget =>
  createTargetFromAgent(options.agent as unknown as AgentExecutor, {
    ...options,
    containment: options.containedTools
      ? describeToolContainment({})
      : "unknown",
  });

export const createAISDKToolLoopTarget = <
  CALL_OPTIONS,
  TOOLS extends ToolSet,
  OUTPUT extends Output.Output,
  RUNTIME_CONTEXT extends RuntimeContext = RuntimeContext,
>(
  options: AISDKToolLoopTargetOptions<
    CALL_OPTIONS,
    TOOLS,
    OUTPUT,
    RUNTIME_CONTEXT
  >
): RuntimeScanTarget => {
  const {
    invocationMode,
    metadata,
    name,
    provider,
    callOptions,
    containment,
    ...agentSettings
  } = options;
  const policy = resolveToolContainment(containment);
  if (agentSettings.tools) {
    agentSettings.tools = wrapToolSet(agentSettings.tools, policy);
  }
  const agent = new ToolLoopAgent(
    agentSettings as ToolLoopAgentSettings<
      CALL_OPTIONS,
      TOOLS,
      RUNTIME_CONTEXT,
      OUTPUT
    >
  );
  const model = asRecord(agentSettings.model);
  return createTargetFromAgent(agent as unknown as AgentExecutor, {
    instructions: agentSettings.instructions,
    callOptions,
    containment: describeToolContainment(policy),
    invocationMode,
    metadata,
    model: typeof model?.modelId === "string" ? model.modelId : undefined,
    name,
    provider:
      provider ??
      (typeof model?.provider === "string" ? model.provider : "ai-sdk"),
  });
};

export function aiSdk<
  CALL_OPTIONS,
  TOOLS extends ToolSet,
  OUTPUT extends Output.Output,
  RUNTIME_CONTEXT extends RuntimeContext = RuntimeContext,
>(
  options:
    | AISDKAgentTargetOptions<CALL_OPTIONS, TOOLS, OUTPUT, RUNTIME_CONTEXT>
    | AISDKToolLoopTargetOptions<CALL_OPTIONS, TOOLS, OUTPUT, RUNTIME_CONTEXT>
): RuntimeScanTarget;
export function aiSdk(options: unknown): RuntimeScanTarget {
  if (!(options && typeof options === "object")) {
    throw new Error("AI SDK target options must be an object");
  }
  return "agent" in options
    ? createAISDKAgentTarget(
        options as AISDKAgentTargetOptions<never, ToolSet, Output.Output>
      )
    : createAISDKToolLoopTarget(
        options as AISDKToolLoopTargetOptions<never, ToolSet, Output.Output>
      );
}
