# @zeroleaks/sdk

Official TypeScript SDK for ZeroLeaks. Run hosted red-team probes through your actual application agent, including its model settings, instructions, memory, middleware, tools, and tool execution loop.

## Install

```bash
bun add @zeroleaks/sdk
# or: npm install @zeroleaks/sdk
```

```bash
ZEROLEAKS_API_KEY=zl_live_...
```

## Wrap any production agent

```typescript
import { ZeroLeaks, createRuntimeTarget } from "@zeroleaks/sdk";

const zeroleaks = new ZeroLeaks();
const target = createRuntimeTarget({
  definition: {
    name: "Production support agent",
    provider: "custom",
    tools: productionToolDefinitions,
  },
  invoke: ({ messages, sessionId, signal }) =>
    runProductionAgent({ messages, sessionId, signal }),
  reset: (sessionId) => resetProductionAgent(sessionId),
});

const { report } = await zeroleaks.runtimeScans.run(target);
console.log(report.overallScore, report.toolTrace);
```

## Runtime execution in v0.2.1

Runtime scans execute independent sessions concurrently, with a default concurrency of `8` and a maximum of `16`. Events within the same multi-turn session always remain ordered.

```typescript
const { report } = await zeroleaks.runtimeScans.run(target, {
  eventConcurrency: 4,
  workerStallTimeoutMs: 6 * 60_000,
});
```

The hosted engine runs extraction, injection, and agent-specific tracks in parallel and checkpoints long extraction scans. If the hosted worker stops making progress, the SDK cancels the run instead of polling indefinitely.

Upgrade with `bun add @zeroleaks/sdk@^0.2.1` or `npm install @zeroleaks/sdk@^0.2.1`. This release does not require application code changes.

## AI SDK

```typescript
import { aiSdk } from "@zeroleaks/sdk/ai-sdk";

const target = aiSdk({ agent: productionAgent });
await zeroleaks.runtimeScans.run(target);
```

You can also pass normal `ToolLoopAgent` settings directly. All configured tools are included by default; input/output schemas, calls, results, errors, approval metadata, and provider-executed tools are preserved where available.

## OpenAI

```typescript
import { openAI } from "@zeroleaks/sdk/openai";

const target = openAI.responses({
  client: openai,
  request: {
    model: "gpt-5",
    instructions,
    tools,
  },
  toolExecutors,
});

await zeroleaks.runtimeScans.run(target);
```

Both Responses API and Chat Completions function-tool loops are supported.

## Other scans

```typescript
await zeroleaks.scans.run({ systemPrompt, scanMode: "full" });
await zeroleaks.endpointScans.run(endpointConfigId);
await zeroleaks.skillScans.run({ source: skillRepository, mode: "full" });
```

`agentConfigs` and `agentScans` remain compatibility aliases for `endpointConfigs` and `endpointScans`.

## Security

Run runtime scans with the same policy and tool-control code as production, but use isolated databases, test tenants, sink integrations, and scan-specific credentials for tools that can create irreversible side effects.

API keys are server credentials. Never expose them in browser bundles.

Documentation: `https://zeroleaks.ai/docs/sdk`

License: MIT
