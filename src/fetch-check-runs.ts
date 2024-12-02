import * as github from "@actions/github";
import type { components } from "@octokit/openapi-types";
import { inputs } from "./inputs";
import { RelevantCheckRuns } from "./relevant-check-runs";
import { retry } from "@octokit/plugin-retry";
export type CheckRun = components["schemas"]["check-run"];

const octokit = github.getOctokit(inputs.token, undefined, retry);

export const fetchCheckRuns = async (): Promise<RelevantCheckRuns> => {
  const iterator = octokit.paginate.iterator(octokit.rest.checks.listForRef, {
    ...github.context.repo,
    ref: inputs.ref,
    per_page: 100,
  });

  let runs: CheckRun[] = [];

  for await (const { data } of iterator) {
    runs = runs.concat(data);
  }

  return new RelevantCheckRuns(
    runs.filter(
      (run) => run.name !== inputs.name && !inputs.ignored.has(run.name),
    ),
  );
};
