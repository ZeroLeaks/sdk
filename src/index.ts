// biome-ignore-all lint/performance/noBarrelFile: This is the package's intentional public entry point.
export { createZeroLeaks, ZeroLeaks, type ZeroLeaksOptions } from "./client";
export {
  decideToolContainment,
  isSimulatedToolResult,
  resolveToolContainment,
  runContainedTool,
  type SimulatedToolResult,
  type ToolContainmentDecision,
  type ToolContainmentOption,
  type ToolContainmentPolicy,
} from "./containment";
export {
  ZeroLeaksAbortError,
  ZeroLeaksError,
  type ZeroLeaksErrorOptions,
  ZeroLeaksScanError,
  ZeroLeaksTimeoutError,
} from "./errors";
export {
  createRuntimeTarget,
  defineRuntimeTarget,
  type RuntimeHandlerTargetOptions,
} from "./runtime";
export type * from "./types";
