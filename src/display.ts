import * as core from "@actions/core";
import { RelevantCheckRuns } from "./relevant-check-runs";
import { CheckRun } from "./fetch-check-runs";

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
} as const;

type Color = (typeof colors)[keyof typeof colors];

const logAsGroup = (name: string, lines: string[]): void => {
  if (lines.length > 0) {
    core.startGroup(name);
    for (const item of lines) {
      console.info(item);
    }
    core.endGroup();
  }
};

const logCheckRuns = (
  icon: string,
  color: Color,
  runs: CheckRun["name"][],
): void => {
  if (runs.length > 0) {
    logAsGroup(`${icon} ${color}${runs.length}${colors.reset}`, runs);
  }
};

export const Display = {
  timedOut: () => {
    console.info("");
    console.info(`⏰ ${colors.red}Timed out!${colors.reset}`);
  },

  delaying: (seconds: number) => {
    console.info(`🦥 Inspecting again in ${seconds}s...`);
  },

  overallFailure: () => {
    console.info("");
    console.info(`❗ ${colors.red}Failure!${colors.reset}`);
  },

  overallSuccess: () => {
    console.info("");
    console.info(`🚀 ${colors.green}Success!${colors.reset}`);
  },

  startingIteration: () => {
    console.info("");
  },

  ignoredCheckNames: (ignoredCheckNames: Set<string>) => {
    if (ignoredCheckNames.size > 0) {
      logAsGroup("Ignored check names", [...ignoredCheckNames]);
    }
  },

  relevantCheckRuns: (checkRuns: RelevantCheckRuns) => {
    logCheckRuns("✅", colors.green, checkRuns.succeeded);
    logCheckRuns("❌", colors.red, checkRuns.failed);
    logCheckRuns("⏳", colors.reset, checkRuns.pending);
  },
};
