import { describe, expect, test } from "bun:test";
import { jsonSchema, tool } from "ai";
import { aiSdk, containTools } from "./ai-sdk";
import {
  decideToolContainment,
  findExternalDestination,
  isSimulatedToolResult,
  resolveToolContainment,
  runContainedTool,
} from "./containment";
import { createOpenAIResponsesTarget } from "./openai";

const invocation = {
  runtimeScanId: "scan_1",
  eventId: "event_1",
  sessionId: "session_1",
  message: "probe",
  messages: [{ role: "user" as const, content: "probe" }],
};

describe("decideToolContainment", () => {
  test("simulates tools whose names change something", () => {
    for (const name of [
      "delete_user",
      "deleteUser",
      "user-delete",
      "send_email",
      "issueRefund",
      "transfer_funds",
      "run_shell",
      "write_file",
    ]) {
      const decision = decideToolContainment(name, {});
      expect(decision.contained).toBe(true);
      expect(decision.category).toBe("side_effect");
    }
  });

  test("lets read-only calls through, including reads about writes", () => {
    for (const name of [
      "lookup_customer",
      "get_refund_status",
      "listOrders",
      "search_docs",
      "deleted_items_report",
    ]) {
      expect(decideToolContainment(name, { id: "1" }).contained).toBe(false);
    }
  });

  test("treats an outside destination in any argument as egress", () => {
    expect(
      decideToolContainment("fetch_page", { url: "https://evil.example.com/x" })
    ).toMatchObject({ contained: true, category: "egress" });
    expect(
      decideToolContainment("lookup", {
        nested: [{ cc: "attacker@exfil.example.net" }],
      })
    ).toMatchObject({ contained: true, category: "egress" });
  });

  test("canary sinks, loopback, and allowlisted hosts are not egress", () => {
    expect(
      findExternalDestination({ url: "https://canary.zeroleaks.invalid/x" })
    ).toBeUndefined();
    expect(
      findExternalDestination({ url: "http://localhost:3000/health" })
    ).toBeUndefined();
    expect(
      findExternalDestination({ url: "https://api.internal.acme.com/v1" }, [
        "acme.com",
      ])
    ).toBeUndefined();
    expect(
      findExternalDestination({ url: "https://acme.com.evil.net" }, [
        "acme.com",
      ])
    ).toBe("acme.com.evil.net");
  });

  test("explicit lists win over the heuristics", () => {
    expect(
      decideToolContainment(
        "update_ticket",
        {},
        { allowTools: ["update_ticket"] }
      ).contained
    ).toBe(false);
    expect(
      decideToolContainment(
        "lookup_customer",
        {},
        {
          simulateTools: ["lookup_customer"],
        }
      )
    ).toMatchObject({ contained: true, category: "policy" });
  });

  test("containment can be switched off", async () => {
    expect(resolveToolContainment(false)).toBeNull();
    expect(resolveToolContainment(undefined)).toEqual({});
    let ran = false;
    await runContainedTool(
      "delete_user",
      {},
      () => {
        ran = true;
      },
      null
    );
    expect(ran).toBe(true);
  });
});

describe("adapters contain tools by default", () => {
  test("OpenAI executors never run a contained call", async () => {
    let deleted = false;
    let step = 0;
    const requests: Record<string, unknown>[] = [];
    const client = {
      responses: {
        create: (request: Record<string, unknown>) => {
          requests.push(request);
          step += 1;
          return Promise.resolve(
            step === 1
              ? {
                  output: [
                    {
                      type: "function_call",
                      call_id: "call_1",
                      name: "delete_user",
                      arguments: '{"id":"123"}',
                    },
                  ],
                }
              : { output_text: "Done", output: [] }
          );
        },
      },
    };
    const target = createOpenAIResponsesTarget({
      client: client as never,
      request: { model: "gpt-test" },
      toolExecutors: {
        delete_user: () => {
          deleted = true;
          return { ok: true };
        },
      },
    });
    const description = await target.describe();
    expect(description.metadata).toMatchObject({
      containment: { enabled: true },
    });
    const result = await target.invoke(invocation);
    expect(deleted).toBe(false);
    if (typeof result !== "string") {
      expect(result.toolCalls?.[0]).toMatchObject({
        name: "delete_user",
        arguments: { id: "123" },
        contained: true,
      });
      expect(isSimulatedToolResult(result.toolCalls?.[0]?.result)).toBe(true);
    }
  });

  test("OpenAI executors run for real with containment off", async () => {
    let deleted = false;
    let step = 0;
    const client = {
      responses: {
        create: () => {
          step += 1;
          return Promise.resolve(
            step === 1
              ? {
                  output: [
                    {
                      type: "function_call",
                      call_id: "call_1",
                      name: "delete_user",
                      arguments: "{}",
                    },
                  ],
                }
              : { output_text: "Done", output: [] }
          );
        },
      },
    };
    const target = createOpenAIResponsesTarget({
      client: client as never,
      containment: false,
      request: { model: "gpt-test" },
      toolExecutors: {
        delete_user: () => {
          deleted = true;
          return { ok: true };
        },
      },
    });
    await target.invoke(invocation);
    expect(deleted).toBe(true);
    expect((await target.describe()).metadata).toMatchObject({
      containment: { enabled: false },
    });
  });

  test("containTools wraps AI SDK executes and keeps reads live", async () => {
    let deleted = false;
    const tools = containTools({
      deleteUser: tool({
        description: "Delete a user",
        inputSchema: jsonSchema<{ id: string }>({ type: "object" }),
        execute: () => {
          deleted = true;
          return { ok: true };
        },
      }),
      lookupUser: tool({
        description: "Look up a user",
        inputSchema: jsonSchema<{ id: string }>({ type: "object" }),
        execute: ({ id }: { id: string }) => ({ id, name: "Ada" }),
      }),
    });
    const options = { toolCallId: "c", messages: [] } as never;
    const simulated = await tools.deleteUser.execute?.({ id: "1" }, options);
    expect(deleted).toBe(false);
    expect(isSimulatedToolResult(simulated)).toBe(true);
    expect(await tools.lookupUser.execute?.({ id: "1" }, options)).toEqual({
      id: "1",
      name: "Ada",
    });
  });

  test("a prebuilt AI SDK agent reports whether its tools were contained", async () => {
    const agent = {
      tools: {},
      generate: () => Promise.reject(new Error("unused")),
      stream: () => Promise.reject(new Error("unused")),
    };
    const unknown = await aiSdk({ agent: agent as never }).describe();
    expect(unknown.metadata).toMatchObject({ containment: "unknown" });
    const contained = await aiSdk({
      agent: agent as never,
      containedTools: true,
    }).describe();
    expect(contained.metadata).toMatchObject({
      containment: { enabled: true },
    });
  });
});
