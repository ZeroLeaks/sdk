# @zeroleaks/sdk

<p><img src="./assets/zeroleaks-sdk.svg" alt="ZeroLeaks SDK" width="88" height="88" /></p>

Official TypeScript SDK for ZeroLeaks. Run hosted red-team scans through your actual application agent, with its model settings, instructions, memory, middleware, tools, and tool execution loop, or against a deployed HTTPS endpoint.

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

## Runtime execution in v0.2.2

Runtime scans execute independent sessions concurrently, with a default concurrency of `8` and a maximum of `16`. Events within the same multi-turn session always remain ordered.

```typescript
const { report } = await zeroleaks.runtimeScans.run(target, {
  eventConcurrency: 4,
  workerStallTimeoutMs: 6 * 60_000,
  scan: { scanMode: "full" },
});
```

Full mode is the default. After a short reconnaissance step, it runs three tracks in parallel: secrets in context (credentials, rules, tool schemas, and internal hosts the agent leaks), adaptive injection, and target-specific agent probes including the complete production probe catalog. Use `scan: { scanMode: "quick" }` only for a smaller development smoke test.

A scan reports what to fix; it does not rerun exploits against the fixed agent. The next scan runs the same attacks again.

## Changes in v0.3.0

Hosted prompt scans are retired. `scans.create` and `scans.run` are deprecated: the server answers `410 Gone`, and both reject with a `ZeroLeaksError` whose `code` is `PROMPT_SCANS_RETIRED`, so `scans.run` never starts polling. `ScanMode`, `CreateScanRequest`, and `CreateScanResponse` are deprecated with them. `scans.get`, `scans.list`, `scans.wait`, and `scans.cancel` still work for historical scans.

`CapabilitiesResponse` makes the prompt-scan fields `scanModes`, `targetModels`, `defaultTargetModel`, and `limits.minimumSystemPromptCharacters` optional, and adds `promptScans` (the retirement notice and its replacements) and `deprecations`.

`AgentReport` types the findings in each component and all of `boundaryAssurance`: the secrets-in-context summary, defense fingerprints, long-horizon campaign state, and `searchTree`, the bounded attack-path search with every path it explored or pruned and why. Secrets-in-context findings carry `leakClass`, `evidenceStrength`, and, for judge-only leaks, `claimedSpan`. `EndpointConfigInput` takes a write-only `plantedSecret` canary.

```typescript
const { report } = await zeroleaks.endpointScans.run(endpointConfigId);
for (const leak of report?.boundaryAssurance?.secretsInContext?.leaks ?? []) {
  console.log(leak.class, leak.severity, leak.evidence);
}
```

Three type changes can break a build. `components` was `Record<string, unknown>` and now names `promptSecurity`, `toolSafety`, `multiTurnResilience`, and `dataLeakage`; indexing it with a string still compiles, but a report you build by hand in a test needs all four. `boundaryAssurance` was `unknown` in 0.2.2 and is now `BoundaryAssurance | undefined`, so a hand-built fixture needs every required field (`generatedBy`, `usedFallback`, `invariants`, `initialProbes`, `mutatedProbes`, `violations`, `retrievedSeedIds`, `promotedProbes`), and a cast to your own interface has to go through `unknown`. Code that reads the now-optional capabilities fields has to handle `undefined`.

Upgrade with `bun add @zeroleaks/sdk@^0.3.0` or `npm install @zeroleaks/sdk@^0.3.0`.

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
await zeroleaks.endpointScans.run(endpointConfigId);
await zeroleaks.skillScans.run({ source: skillRepository, mode: "full" });
```

Hosted prompt scans are retired (see [v0.3.0](#changes-in-v030)). To test a standalone system prompt, run the source-available (FSL) [`zeroleaks`](https://www.npmjs.com/package/zeroleaks) CLI locally with your own model keys.

`agentConfigs` and `agentScans` remain compatibility aliases for `endpointConfigs` and `endpointScans`.

## Security

Run runtime scans with the same policy and tool-control code as production, but use isolated databases, test tenants, sink integrations, and scan-specific credentials for tools that can create irreversible side effects. ZeroLeaks rewrites external destinations in attack payloads to `.invalid` canary hosts, but your tools still execute whatever the agent asks them to.

API keys are server credentials. Never expose them in browser bundles.

Documentation: `https://zeroleaks.ai/docs/sdk`

License: MIT
