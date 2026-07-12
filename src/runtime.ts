import type {
  RuntimeScanTarget,
  RuntimeTargetDefinition,
  RuntimeTargetInvocation,
  RuntimeTargetResponse,
} from "./types";

export interface RuntimeHandlerTargetOptions {
  definition:
    | RuntimeTargetDefinition
    | (() => Promise<RuntimeTargetDefinition> | RuntimeTargetDefinition);
  invoke: (
    invocation: RuntimeTargetInvocation
  ) => Promise<RuntimeTargetResponse | string> | RuntimeTargetResponse | string;
  reset?: (sessionId: string) => Promise<void> | void;
}

export const createRuntimeTarget = (
  options: RuntimeHandlerTargetOptions
): RuntimeScanTarget => ({
  describe: async () =>
    typeof options.definition === "function"
      ? await options.definition()
      : options.definition,
  invoke: options.invoke,
  reset: options.reset,
});

export const defineRuntimeTarget = <Target extends RuntimeScanTarget>(
  target: Target
): Target => target;
