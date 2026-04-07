import { RelevantCheckRuns } from "./relevant-check-runs";

export interface WaitDependencies {
  fetchCheckRuns: () => Promise<RelevantCheckRuns>;
  delay: (secs: number) => Promise<void>;
  elapsedSeconds: () => number;
  onSuccess: () => void;
  onEmptySuccess: () => void;
  onFailure: (message: string) => void;
  onTimeout: (message: string) => void;
  onDelaying: (seconds: number) => void;
  onIterationStart: () => void;
  onDisplayCheckRuns: (checkRuns: RelevantCheckRuns) => void;
}

export interface WaitOptions {
  interval: number;
  timeout: number;
  allowEmpty: boolean;
  emptySettleTime: number;
}

export async function waitForCheckRuns(
  deps: WaitDependencies,
  opts: WaitOptions,
): Promise<void> {
  while (deps.elapsedSeconds() <= opts.timeout) {
    deps.onIterationStart();

    const checkRuns = await deps.fetchCheckRuns();

    if (checkRuns.total() === 0) {
      if (opts.allowEmpty && deps.elapsedSeconds() >= opts.emptySettleTime) {
        deps.onEmptySuccess();
        return;
      }

      deps.onDelaying(opts.interval);
      await deps.delay(opts.interval);
      continue;
    }

    deps.onDisplayCheckRuns(checkRuns);

    if (checkRuns.isOverallFailure()) {
      deps.onFailure("A check run failed.");
      return;
    }

    if (checkRuns.isOverallSuccess()) {
      deps.onSuccess();
      return;
    }

    deps.onDelaying(opts.interval);
    await deps.delay(opts.interval);
  }

  deps.onTimeout("Timed out waiting on check runs to all be successful.");
}
