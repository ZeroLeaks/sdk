# @zeroleaks/sdk

Official TypeScript SDK for the ZeroLeaks developer API. Run prompt-security scans, test deployed agents, scan agent skills, and retrieve reports from Node.js or Bun.

## Installation

```bash
bun add @zeroleaks/sdk
# or
npm install @zeroleaks/sdk
```

Set your server-side API key:

```env
ZEROLEAKS_API_KEY=zl_live_...
```

## Quick start

```typescript
import { ZeroLeaks } from "@zeroleaks/sdk";

const zeroleaks = new ZeroLeaks();

const { scan, report } = await zeroleaks.scans.run({
  systemPrompt: "You are a customer support assistant.",
  scanMode: "dual",
});

console.log(scan.status, report.overallScore);
```

## Deployed-agent scan

```typescript
const { id: configId } = await zeroleaks.agentConfigs.create({
  name: "Support agent",
  endpointUrl: "https://api.example.com/chat",
  authMethod: "bearer",
  authValue: process.env.AGENT_API_KEY,
  requestFormat: {
    method: "POST",
    messageField: "message",
    responseField: "answer",
  },
});

const result = await zeroleaks.agentScans.run(configId);
console.log(result.report?.overallScore);
```

## Skill scan

```typescript
const result = await zeroleaks.skillScans.run({
  source: "https://github.com/example/agent-skills/tree/main/research",
  mode: "full",
});

console.log(result.report);
```

API keys must only be used in server-side code. See the full documentation at `https://zeroleaks.ai/docs/sdk`.
