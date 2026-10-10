import { AsyncLocalStorage } from "node:async_hooks";

const runIds = new AsyncLocalStorage<string>();

export function currentRunId(): string | null {
  return runIds.getStore() ?? null;
}

export function runWithRunId<T>(runId: string, work: () => Promise<T>): Promise<T> {
  return runIds.run(runId, work);
}
