import * as core from "@actions/core";
import { delay } from "./delay";
import { fetchCheckRuns } from "./fetch-check-runs";
import { inputs } from "./inputs";
import { Display } from "./display";
import { waitForCheckRuns } from "./wait-for-check-runs";

const startTime = new Date();

Display.ignoredCheckPatterns(inputs.ignored.patterns);

const elapsedSeconds = (): number =>
  Math.round((new Date().getTime() - startTime.getTime()) / 1000);

const run = async (): Promise<void> => {
  try {
    await waitForCheckRuns(
      {
        fetchCheckRuns,
        delay,
        elapsedSeconds,
        onSuccess: Display.overallSuccess,
        onEmptySuccess: Display.emptySuccess,
        onFailure: (message) => {
          Display.overallFailure();
          core.setFailed(message);
        },
        onTimeout: (message) => {
          Display.timedOut();
          core.setFailed(message);
        },
        onDelaying: Display.delaying,
        onIterationStart: Display.startingIteration,
        onDisplayCheckRuns: Display.relevantCheckRuns,
      },
      {
        interval: inputs.interval,
        timeout: inputs.timeout,
        allowEmpty: inputs.allowEmpty,
        emptySettleTime: inputs.emptySettleTime,
      },
    );
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error);
    } else {
      throw error;
    }
  }
};

run();
