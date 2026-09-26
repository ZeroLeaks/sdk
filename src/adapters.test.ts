import { describe, expect, test } from "bun:test";
import { jsonSchema, tool } from "ai";
import { aiSdk, serializeAISDKTools } from "./ai-sdk";
import {
  createOpenAIChatCompletionsTarget,
  createOpenAIResponsesTarget,
} from "./openai";

describe("AI SDK adapter", () => {
  test("serializes complete tool definitions and observed results", async () => {
    const tools = {
      lookupCustomer: tool({
        description: "Look up a customer",
        inputSchema: jsonSchema<{ id: string }>({
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        }),
        outputSchema: jsonSchema<{ name: string }>({
          type: "object",
          properties: { name: { type: "string" } },
        }),
        execute: ({ id }: { id: string }) => ({ id, name: "Ada" }),
      }),
    };
    const definitions = await serializeAISDKTools(tools);
    expect(definitions[0]?.inputSchema).toMatchObject({ type: "object" });
    expect(definitions[0]?.outputSchema).toMatchObject({ type: "object" });
    expect(definitions[0]?.definition).toMatchObject({ hasExecute: true });

    const target = aiSdk({
      agent: {
        version: "agent-v1",
        id: "support-agent",
        tools,
        generate: () =>
          Promise.resolve({
            text: "Customer found",
            toolCalls: [
              {
                toolCallId: "call_1",
                toolName: "lookupCustomer",
                input: { id: "123" },
              },
            ],
            toolResults: [
              {
                toolCallId: "call_1",
                toolName: "lookupCustomer",
                output: { name: "Ada" },
              },
            ],
            steps: [
              {
                toolCalls: [
                  {
                    toolCallId: "call_1",
                    toolName: "lookupCustomer",
                    input: { id: "123" },
                  },
                ],
                toolResults: [
                  {
                    toolCallId: "call_1",
                    toolName: "lookupCustomer",
                    output: { name: "Ada" },
                  },
                ],
              },
            ],
            finishReason: "stop",
            usage: { inputTokens: 10, outputTokens: 3 },
            response: {
              messages: [{ role: "assistant", content: "Customer found" }],
            },
          } as never),
        stream: () => Promise.reject(new Error("not used")),
      },
    });
    const description = await target.describe();
    expect(description.tools?.[0]?.name).toBe("lookupCustomer");
    const result = await target.invoke({
      runtimeScanId: "scan_1",
      eventId: "event_1",
      sessionId: "session_1",
      message: "Find customer 123",
      messages: [{ role: "user", content: "Find customer 123" }],
    });
    expect(typeof result).not.toBe("string");
    if (typeof result !== "string") {
      expect(result.toolCalls?.[0]).toMatchObject({
        name: "lookupCustomer",
        result: { name: "Ada" },
      });
      expect(result.toolCalls).toHaveLength(1);
    }
  });
});

describe("OpenAI adapters", () => {
  test("runs a Responses API function-tool loop", async () => {
    const requests: Record<string, unknown>[] = [];
    const client = {
      responses: {
        create: (request: Record<string, unknown>) => {
          requests.push(request);
          return Promise.resolve(
            requests.length === 1
              ? {
                  id: "response_1",
                  output: [
                    {
                      type: "function_call",
                      call_id: "call_1",
                      name: "lookup_customer",
                      arguments: '{"id":"123"}',
                    },
                  ],
                }
              : {
                  id: "response_2",
                  status: "completed",
                  output_text: "Customer Ada",
                  output: [],
                }
          );
        },
      },
    };
    const target = createOpenAIResponsesTarget({
      client: client as never,
      request: {
        model: "gpt-test",
        tools: [
          {
            type: "function",
            name: "lookup_customer",
            description: "Look up a customer",
            parameters: {
              type: "object",
              properties: { id: { type: "string" } },
              required: ["id"],
              additionalProperties: false,
            },
            strict: true,
          },
        ],
      },
      toolExecutors: {
        lookup_customer: ({ id }) => ({ id, name: "Ada" }),
      },
    });
    const description = await target.describe();
    expect(description.tools?.[0]).toMatchObject({
      name: "lookup_customer",
      strict: true,
    });
    const result = await target.invoke({
      runtimeScanId: "scan_1",
      eventId: "event_1",
      sessionId: "session_1",
      message: "Find customer 123",
      messages: [{ role: "user", content: "Find customer 123" }],
    });
    expect(typeof result).not.toBe("string");
    if (typeof result !== "string") {
      expect(result.text).toBe("Customer Ada");
      expect(result.toolCalls?.[0]?.result).toMatchObject({ name: "Ada" });
    }
    expect(requests[1]?.input).toEqual([
      {
        type: "function_call_output",
        call_id: "call_1",
        output: '{"id":"123","name":"Ada"}',
      },
    ]);
  });

  test("runs a Chat Completions function-tool loop", async () => {
    let calls = 0;
    const requests: Record<string, unknown>[] = [];
    const client = {
      chat: {
        completions: {
          create: (request: Record<string, unknown>) => {
            requests.push(request);
            calls += 1;
            return Promise.resolve(
              calls === 1
                ? {
                    choices: [
                      {
                        message: {
                          role: "assistant",
                          content: null,
                          tool_calls: [
                            {
                              id: "call_1",
                              type: "function",
                              function: {
                                name: "lookup_customer",
                                arguments: '{"id":"123"}',
                              },
                            },
                          ],
                        },
                      },
                    ],
                  }
                : {
                    choices: [
                      {
                        finish_reason: "stop",
                        message: { role: "assistant", content: "Customer Ada" },
                      },
                    ],
                  }
            );
          },
        },
      },
    };
    const target = createOpenAIChatCompletionsTarget({
      client: client as never,
      request: {
        model: "gpt-test",
        tools: [
          {
            type: "function",
            function: {
              name: "lookup_customer",
              description: "Look up a customer",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
      },
      toolExecutors: {
        lookup_customer: () => ({ name: "Ada" }),
      },
    });
    const result = await target.invoke({
      runtimeScanId: "scan_1",
      eventId: "event_1",
      sessionId: "session_1",
      message: "Find customer 123",
      messages: [{ role: "user", content: "Find customer 123" }],
    });
    expect(typeof result).not.toBe("string");
    if (typeof result !== "string") {
      expect(result.text).toBe("Customer Ada");
      expect(result.toolCalls?.[0]?.name).toBe("lookup_customer");
      const messages = [
        ...(result.messages ?? []),
        { role: "user", content: "What was the customer name?" },
      ];
      await target.invoke({
        runtimeScanId: "scan_1",
        eventId: "event_2",
        sessionId: "session_1",
        message: "What was the customer name?",
        messages,
      });
    }
    const secondTurnMessages = requests[2]?.messages as
      | Record<string, unknown>[]
      | undefined;
    expect(secondTurnMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "tool", tool_call_id: "call_1" }),
        expect.objectContaining({
          role: "assistant",
          tool_calls: expect.any(Array),
        }),
      ])
    );
  });
});
