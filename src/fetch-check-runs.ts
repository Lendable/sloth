import * as github from "@actions/github";
import { inputs } from "./inputs";
import { RelevantCheckRuns } from "./relevant-check-runs";
import type { PaginatingEndpoints } from "@octokit/plugin-paginate-rest/dist-types/types";

export type CheckRun =
  PaginatingEndpoints["GET /repos/{owner}/{repo}/commits/{ref}/check-runs"]["response"]["data"][number];

const octokit = github.getOctokit(inputs.token);

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
