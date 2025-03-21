import * as core from "@actions/core";
import { delay } from "./delay";
import { fetchCheckRuns } from "./fetch-check-runs";
import { inputs } from "./inputs";
import { Display } from "./display";

const startTime = new Date();

const shouldTimeOut = (): boolean => {
  const executionTime = Math.round(
    (new Date().getTime() - startTime.getTime()) / 1000,
  );
  return executionTime > inputs.timeout;
};

Display.ignoredCheckNames(inputs.ignored);

const waitForCheckRuns = async (): Promise<void> => {
  try {
    while (!shouldTimeOut()) {
      Display.startingIteration();

      const checkRuns = await fetchCheckRuns();

      if (checkRuns.total() === 0) {
        Display.delaying(inputs.interval);
        await delay(inputs.interval);
        continue;
      }

      Display.relevantCheckRuns(checkRuns);

      if (checkRuns.isOverallFailure()) {
        Display.overallFailure();
        core.setFailed("A check run failed.");
        return;
      }

      if (checkRuns.isOverallSuccess()) {
        Display.overallSuccess();
        return;
      }

      Display.delaying(inputs.interval);
      await delay(inputs.interval);
    }

    Display.timedOut();
    core.setFailed("Timed out waiting on check runs to all be successful.");
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error);
      return;
    } else {
      throw error;
    }
  }
};

waitForCheckRuns();
