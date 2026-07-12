import { createRuntimeTarget, ZeroLeaks } from "@zeroleaks/sdk";
import { productionAgent, productionToolDefinitions } from "./production-agent";

const zeroleaks = new ZeroLeaks();
const target = createRuntimeTarget({
  definition: {
    name: "Production agent",
    provider: "custom",
    tools: productionToolDefinitions,
  },
  invoke: ({ messages, sessionId, signal }) =>
    productionAgent.run({ messages, sessionId, signal }),
  reset: (sessionId) => productionAgent.reset(sessionId),
});

const { report } = await zeroleaks.runtimeScans.run(target, {
  onPoll: ({ currentPhase }) => console.log(currentPhase),
});

console.log(report.overallScore);
