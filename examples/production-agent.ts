import type {
  AgentTool,
  RuntimeTargetMessage,
  RuntimeTargetResponse,
} from "@zeroleaks/sdk";

export const productionToolDefinitions: AgentTool[] = [
  {
    name: "lookup_customer",
    description: "Read a customer profile",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];

export const productionAgent = {
  reset: (_sessionId: string): void => {
    // Replace with the same session reset used by the application.
  },
  run: (input: {
    messages: RuntimeTargetMessage[];
    sessionId: string;
    signal?: AbortSignal;
  }): RuntimeTargetResponse => {
    // Replace this body with the application's real production agent call.
    const lastMessage = input.messages.at(-1);
    return {
      text: `Example response to: ${String(lastMessage?.content ?? "")}`,
      messages: [
        ...input.messages,
        { role: "assistant", content: "Example response" },
      ],
    };
  },
};
