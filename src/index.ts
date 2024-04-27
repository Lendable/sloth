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

if (inputs.ignored.size > 0) {
  console.info("::group::Ignored check names");
  console.info([...inputs.ignored]);
  console.info("::endgroup::");
}

const outputCheckRuns = (icon: string, color: Color, runs: string[]): void => {
  if (runs.length === 0) {
    return;
  }

  console.info(`::group::${icon} ${color}${runs.length}${colors.reset}`);
  for (const name of runs) {
    console.info(name);
  }
  console.info("::endgroup::");
};

(async () => {
  while (true) {
    let checks: GitHubCheckRuns = [];

    console.info("");

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
      } else {
        if (failureConclusions.includes(check.conclusion)) {
          failures.push(check.name);
        } else {
          successful.push(check.name);
        }
      }
    }

    for (const runs of [successful, failures, pending]) {
      runs.sort();
    }

    outputCheckRuns("✅", colors.green, successful);
    outputCheckRuns("❌", colors.red, failures);
    outputCheckRuns("⏳", colors.reset, pending);

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

    const executionTime = Math.round(
      (new Date().getTime() - startTime.getTime()) / 1000,
    );

    if (executionTime > inputs.timeout) {
      console.info("");
      console.info(`⏰ ${colors.red}Timed out!${colors.reset}`);
      core.setFailed("Timed out waiting on check runs to all be successful.");
      return;
    }

    console.info(`Slothing, verifying again in ${inputs.interval}s...`);
    await delay(inputs.interval);
  }
})();
