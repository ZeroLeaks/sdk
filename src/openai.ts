import type OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions/completions";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type {
  AgentTool,
  RuntimeScanTarget,
  RuntimeTargetInvocation,
  RuntimeTargetMessage,
  RuntimeTargetResponse,
  RuntimeToolCall,
} from "./types";

export interface OpenAIToolExecutorContext {
  invocation: RuntimeTargetInvocation;
  toolCallId: string;
  toolName: string;
}

export type OpenAIToolExecutor = (
  input: Record<string, unknown>,
  context: OpenAIToolExecutorContext
) => Promise<unknown> | unknown;

interface OpenAITargetBaseOptions {
  client: OpenAI;
  maxToolRounds?: number;
  metadata?: unknown;
  name?: string;
  toolErrorMode?: "return" | "throw";
  toolExecutors?: Record<string, OpenAIToolExecutor>;
}

export interface OpenAIResponsesTargetOptions extends OpenAITargetBaseOptions {
  request: Omit<ResponseCreateParamsNonStreaming, "input" | "stream">;
}

export interface OpenAIChatCompletionsTargetOptions
  extends OpenAITargetBaseOptions {
  instructions?: RuntimeTargetMessage[] | string;
  request: Omit<ChatCompletionCreateParamsNonStreaming, "messages" | "stream">;
}

interface OpenAIClientExecutor {
  chat: {
    completions: {
      create: (body: Record<string, unknown>) => PromiseLike<unknown>;
    };
  };
  responses: {
    create: (body: Record<string, unknown>) => PromiseLike<unknown>;
  };
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;

const contentToString = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (content === undefined || content === null) {
    return "";
  }
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
};

const safeToolOutput = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
};

const parseArguments = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const toOpenAIResponsesInput = (
  messages: RuntimeTargetMessage[]
): Record<string, unknown>[] =>
  messages
    .filter((message) => message.role !== "tool")
    .map((message) => ({
      role: message.role,
      content: contentToString(message.content),
    }));

const toOpenAIChatMessages = (
  messages: RuntimeTargetMessage[]
): Record<string, unknown>[] => messages.map((message) => ({ ...message }));

const serializeResponsesTools = (tools: unknown): AgentTool[] | undefined => {
  if (!Array.isArray(tools)) {
    return undefined;
  }
  return tools.map((value, index) => {
    const tool = asRecord(value) ?? {};
    const type = typeof tool.type === "string" ? tool.type : "tool";
    const name =
      typeof tool.name === "string" ? tool.name : `${type}_${index + 1}`;
    return {
      name,
      description:
        typeof tool.description === "string" ? tool.description : undefined,
      inputSchema: tool.parameters,
      strict: typeof tool.strict === "boolean" ? tool.strict : undefined,
      type,
      definition: tool,
    };
  });
};

const serializeChatTools = (tools: unknown): AgentTool[] | undefined => {
  if (!Array.isArray(tools)) {
    return undefined;
  }
  return tools.map((value, index) => {
    const tool = asRecord(value) ?? {};
    const functionDefinition = asRecord(tool.function);
    const type = typeof tool.type === "string" ? tool.type : "tool";
    return {
      name:
        typeof functionDefinition?.name === "string"
          ? functionDefinition.name
          : `${type}_${index + 1}`,
      description:
        typeof functionDefinition?.description === "string"
          ? functionDefinition.description
          : undefined,
      inputSchema: functionDefinition?.parameters,
      strict:
        typeof functionDefinition?.strict === "boolean"
          ? functionDefinition.strict
          : undefined,
      type,
      definition: tool,
    };
  });
};

const runTool = async (
  options: OpenAITargetBaseOptions,
  invocation: RuntimeTargetInvocation,
  toolCallId: string,
  toolName: string,
  input: unknown
): Promise<{ error?: string; output: string; value?: unknown }> => {
  const executor = options.toolExecutors?.[toolName];
  if (!executor) {
    throw new Error(`No executor configured for OpenAI tool ${toolName}`);
  }
  try {
    const value = await executor(asRecord(input) ?? { value: input }, {
      invocation,
      toolCallId,
      toolName,
    });
    return { output: safeToolOutput(value), value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.toolErrorMode === "throw") {
      throw error;
    }
    return {
      error: message,
      output: safeToolOutput({ error: message }),
    };
  }
};

const extractResponsesText = (response: Record<string, unknown>): string => {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }
  const output = Array.isArray(response.output) ? response.output : [];
  const text: string[] = [];
  for (const itemValue of output) {
    const item = asRecord(itemValue);
    if (item?.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }
    for (const contentValue of item.content) {
      const content = asRecord(contentValue);
      if (typeof content?.text === "string") {
        text.push(content.text);
      } else if (typeof content?.refusal === "string") {
        text.push(content.refusal);
      }
    }
  }
  return text.join("\n");
};

const getResponseToolCallId = (call: Record<string, unknown>): string => {
  if (typeof call.call_id === "string") {
    return call.call_id;
  }
  if (typeof call.id === "string") {
    return call.id;
  }
  return crypto.randomUUID();
};

const collectProviderToolCalls = (
  output: unknown[],
  trace: RuntimeToolCall[]
): void => {
  for (const itemValue of output) {
    const item = asRecord(itemValue);
    const type = typeof item?.type === "string" ? item.type : undefined;
    if (item && type?.endsWith("_call") && type !== "function_call") {
      trace.push({
        id: typeof item.id === "string" ? item.id : undefined,
        name: type,
        arguments: item,
        providerExecuted: true,
      });
    }
  }
};

const executeResponsesToolCalls = async (
  options: OpenAIResponsesTargetOptions,
  invocation: RuntimeTargetInvocation,
  functionCalls: unknown[],
  trace: RuntimeToolCall[]
): Promise<Record<string, unknown>[]> => {
  const outputs: Record<string, unknown>[] = [];
  for (const callValue of functionCalls) {
    const call = asRecord(callValue) ?? {};
    const toolCallId = getResponseToolCallId(call);
    const toolName = typeof call.name === "string" ? call.name : "unknown_tool";
    const toolInput = parseArguments(call.arguments);
    const result = await runTool(
      options,
      invocation,
      toolCallId,
      toolName,
      toolInput
    );
    trace.push({
      id: toolCallId,
      name: toolName,
      arguments: toolInput,
      result: result.value,
      error: result.error,
    });
    outputs.push({
      type: "function_call_output",
      call_id: toolCallId,
      output: result.output,
    });
  }
  return outputs;
};

const runResponsesTarget = async (
  client: OpenAIClientExecutor,
  options: OpenAIResponsesTargetOptions,
  invocation: RuntimeTargetInvocation
): Promise<RuntimeTargetResponse> => {
  const trace: RuntimeToolCall[] = [];
  let input: unknown = toOpenAIResponsesInput(invocation.messages);
  let previousResponseId = options.request.previous_response_id;
  const maxRounds = Math.max(1, options.maxToolRounds ?? 20);

  for (let round = 0; round < maxRounds; round++) {
    const responseValue = await client.responses.create({
      ...options.request,
      input,
      previous_response_id: previousResponseId,
      stream: false,
    });
    const response = asRecord(responseValue);
    if (!response) {
      throw new Error("OpenAI Responses API returned an invalid response");
    }
    const output = Array.isArray(response.output) ? response.output : [];
    const functionCalls = output.filter(
      (item) => asRecord(item)?.type === "function_call"
    );
    collectProviderToolCalls(output, trace);
    if (functionCalls.length === 0) {
      const text = extractResponsesText(response);
      return {
        text,
        toolCalls: trace,
        finishReason:
          typeof response.status === "string" ? response.status : undefined,
        usage: response.usage,
        messages: [
          ...invocation.messages,
          { role: "assistant", content: text },
        ],
      };
    }

    input = await executeResponsesToolCalls(
      options,
      invocation,
      functionCalls,
      trace
    );
    if (typeof response.id === "string") {
      previousResponseId = response.id;
    }
  }
  throw new Error(`OpenAI Responses tool loop exceeded ${maxRounds} rounds`);
};

const executeChatToolCalls = async (
  options: OpenAIChatCompletionsTargetOptions,
  invocation: RuntimeTargetInvocation,
  toolCalls: unknown[],
  trace: RuntimeToolCall[],
  messages: Record<string, unknown>[]
): Promise<void> => {
  for (const callValue of toolCalls) {
    const call = asRecord(callValue) ?? {};
    const functionCall = asRecord(call.function) ?? {};
    const toolCallId =
      typeof call.id === "string" ? call.id : crypto.randomUUID();
    const toolName =
      typeof functionCall.name === "string"
        ? functionCall.name
        : "unknown_tool";
    const toolInput = parseArguments(functionCall.arguments);
    const result = await runTool(
      options,
      invocation,
      toolCallId,
      toolName,
      toolInput
    );
    trace.push({
      id: toolCallId,
      name: toolName,
      arguments: toolInput,
      result: result.value,
      error: result.error,
    });
    messages.push({
      role: "tool",
      tool_call_id: toolCallId,
      content: result.output,
    });
  }
};

const getChatInstructionMessages = (
  options: OpenAIChatCompletionsTargetOptions
): RuntimeTargetMessage[] => {
  if (typeof options.instructions === "string") {
    return [{ role: "system", content: options.instructions }];
  }
  return options.instructions ?? [];
};

const runChatCompletionsTarget = async (
  client: OpenAIClientExecutor,
  options: OpenAIChatCompletionsTargetOptions,
  invocation: RuntimeTargetInvocation
): Promise<RuntimeTargetResponse> => {
  const messages = toOpenAIChatMessages([
    ...getChatInstructionMessages(options),
    ...invocation.messages,
  ]);
  const trace: RuntimeToolCall[] = [];
  const maxRounds = Math.max(1, options.maxToolRounds ?? 20);

  for (let round = 0; round < maxRounds; round++) {
    const responseValue = await client.chat.completions.create({
      ...options.request,
      messages,
      stream: false,
    });
    const response = asRecord(responseValue);
    const choices = Array.isArray(response?.choices) ? response.choices : [];
    const choice = asRecord(choices[0]);
    const message = asRecord(choice?.message);
    if (!message) {
      throw new Error(
        "OpenAI Chat Completions API returned an invalid response"
      );
    }
    messages.push(message);
    const toolCalls = Array.isArray(message.tool_calls)
      ? message.tool_calls
      : [];
    if (toolCalls.length === 0) {
      return {
        text: contentToString(message.content),
        toolCalls: trace,
        finishReason:
          typeof choice?.finish_reason === "string"
            ? choice.finish_reason
            : undefined,
        usage: response?.usage,
        messages: messages as RuntimeTargetMessage[],
      };
    }
    await executeChatToolCalls(options, invocation, toolCalls, trace, messages);
  }
  throw new Error(
    `OpenAI Chat Completions tool loop exceeded ${maxRounds} rounds`
  );
};

export const createOpenAIResponsesTarget = (
  options: OpenAIResponsesTargetOptions
): RuntimeScanTarget => {
  const client = options.client as unknown as OpenAIClientExecutor;
  return {
    describe: () => ({
      name: options.name ?? "OpenAI Responses agent",
      provider: "openai",
      model: String(options.request.model),
      instructions: options.request.instructions,
      tools: serializeResponsesTools(options.request.tools),
      metadata: {
        adapter: "openai-responses",
        ...asRecord(options.metadata),
      },
    }),
    invoke: async (invocation) =>
      await runResponsesTarget(client, options, invocation),
  };
};

export const createOpenAIChatCompletionsTarget = (
  options: OpenAIChatCompletionsTargetOptions
): RuntimeScanTarget => {
  const client = options.client as unknown as OpenAIClientExecutor;
  return {
    describe: () => ({
      name: options.name ?? "OpenAI Chat Completions agent",
      provider: "openai",
      model: String(options.request.model),
      instructions: options.instructions,
      tools: serializeChatTools(options.request.tools),
      metadata: {
        adapter: "openai-chat-completions",
        ...asRecord(options.metadata),
      },
    }),
    invoke: async (invocation) =>
      await runChatCompletionsTarget(client, options, invocation),
  };
};

export const openAI = {
  chatCompletions: createOpenAIChatCompletionsTarget,
  responses: createOpenAIResponsesTarget,
};
