import * as core from "@actions/core";
import { delay } from "./delay";
import { CheckRunFetcher } from "./fetch-check-runs";
import { Inputs } from "./inputs";
import { Display } from "./display";

const run = async (): Promise<void> => {
  const startTime = new Date();
  let inputs: Inputs;

  try {
    inputs = new Inputs();
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error);
      return;
    } else {
      throw error;
    }
  }

  const shouldTimeOut = (): boolean => {
    const executionTime = Math.round(
      (new Date().getTime() - startTime.getTime()) / 1000,
    );
    return executionTime > inputs.timeout;
  };

  Display.ignoredCheckNames(inputs.ignored);

  try {
    const checkRunFetcher = new CheckRunFetcher(
      inputs.token,
      inputs.ref,
      inputs.name,
      inputs.ignored,
    );

    while (!shouldTimeOut()) {
      Display.startingIteration();

      const checkRuns = await checkRunFetcher.fetch();

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

run();
