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

  // Deduplicate check runs by name, keeping only the most recent one for each name.
  // This is necessary because the GitHub API can return multiple runs for the same check
  // (e.g., when a check is re-run), even with filter: "latest".
  const latestRunsByName = new Map<string, CheckRun>();

  for await (const { data } of iterator) {
    for (const run of data) {
      const existing = latestRunsByName.get(run.name);

      if (!existing) {
        latestRunsByName.set(run.name, run);
      } else {
        const runTime = run.completed_at || run.started_at;
        const existingTime = existing.completed_at || existing.started_at;

        if (runTime && (!existingTime || runTime > existingTime)) {
          latestRunsByName.set(run.name, run);
        }
      }
    }
  }

  return new RelevantCheckRuns(
    Array.from(latestRunsByName.values()).filter(
      (run) => run.name !== inputs.name && !inputs.ignored.has(run.name),
    ),
  );
};
