import * as core from "@actions/core";
import * as github from "@actions/github";
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types";
import { Color, colors } from "./colors";
import { delay } from "./delay";

type GitHubCheckRuns =
  RestEndpointMethodTypes["checks"]["listForRef"]["response"]["data"]["check_runs"];

const startTime = new Date();

const inputs = {
  name: core.getInput("name"),
  interval: Number(core.getInput("interval")),
  timeout: Number(core.getInput("timeout")),
  ref: core.getInput("ref"),
  ignored: new Set(core.getMultilineInput("ignored")),
};

const octokit = github.getOctokit(core.getInput("token", { required: true }));

const failureConclusions = ["failure", "cancelled", "timed_out"];

const shouldTimeOut = (): boolean => {
  const executionTime = Math.round(
    (new Date().getTime() - startTime.getTime()) / 1000,
  );
  return executionTime > inputs.timeout;
};

const timedOut = (): void => {
  console.info("");
  console.info(`⏰ ${colors.red}Timed out!${colors.reset}`);
  core.setFailed("Timed out waiting on check runs to all be successful.");
};

const logGroup = (name: string, items: string[]): void => {
  if (items.length > 0) {
    core.startGroup(name);
    for (const item of items) {
      console.info(item);
    }
    core.endGroup();
  }
};

const logCheckRuns = (icon: string, color: Color, runs: string[]): void => {
  if (runs.length > 0) {
    logGroup(`${icon} ${color}${runs.length}${colors.reset}`, runs);
  }
};

if (inputs.ignored.size > 0) {
  logGroup("Ignored check names", [...inputs.ignored]);
}

const waitForCheckRuns = async (): Promise<void> => {
  while (!shouldTimeOut()) {
    console.info("");

    let checks: GitHubCheckRuns = [];

    const iterator = octokit.paginate.iterator(octokit.rest.checks.listForRef, {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      ref: inputs.ref,
      per_page: 100,
    });

    for await (const { data } of iterator) {
      checks = checks.concat(data);
    }

    checks = checks.filter(
      (v) => v.name !== inputs.name && !inputs.ignored.has(v.name),
    );

    core.debug(`Found a total of ${checks.length} relevant check runs`);

    if (checks.length === 0) {
      console.info(`Slothing, verifying again in ${inputs.interval}s...`);
      await delay(inputs.interval);
      continue;
    }

    const pending: string[] = [];
    const failures: string[] = [];
    const successful: string[] = [];

    for (const check of checks) {
      if (!check.conclusion) {
        pending.push(check.name);
      } else if (failureConclusions.includes(check.conclusion)) {
        failures.push(check.name);
      } else {
        successful.push(check.name);
      }
    }

    for (const runs of [successful, failures, pending]) {
      runs.sort();
    }

    logCheckRuns("✅", colors.green, successful);
    logCheckRuns("❌", colors.red, failures);
    logCheckRuns("⏳", colors.reset, pending);

    if (failures.length > 0) {
      console.info("");
      console.info(`❗ ${colors.red}Failure!${colors.reset}`);
      core.setFailed("A check run failed.");
      return;
    }

    if (pending.length === 0) {
      console.info("");
      console.info(`🚀 ${colors.green}Success!${colors.reset}`);
      return;
    }

    console.info(`Slothing, verifying again in ${inputs.interval}s...`);
    await delay(inputs.interval);
  }

  timedOut();
};

waitForCheckRuns();
