import * as core from "@actions/core";
import * as github from "@actions/github";
import { inputs } from "./inputs";
import { RelevantCheckRuns } from "./relevant-check-runs";
import { selectCheckRuns } from "./select-check-runs";
import {
  type ActionsApi,
  ReplacementTracker,
} from "./superseded-cancellations";
import type { PaginatingEndpoints } from "@octokit/plugin-paginate-rest";

export type CheckRun =
  PaginatingEndpoints["GET /repos/{owner}/{repo}/commits/{ref}/check-runs"]["response"]["data"][number];

const octokit = github.getOctokit(inputs.token);

const actionsApi: ActionsApi = {
  getJob: async (jobId) => {
    const { data } = await octokit.rest.actions.getJobForWorkflowRun({
      ...github.context.repo,
      job_id: jobId,
    });

    return {
      runId: data.run_id,
      runAttempt: data.run_attempt ?? 1,
      headSha: data.head_sha,
    };
  },
  getWorkflowId: async (runId) => {
    const { data } = await octokit.rest.actions.getWorkflowRun({
      ...github.context.repo,
      run_id: runId,
    });

    return data.workflow_id;
  },
  listRuns: async (workflowId, headSha) => {
    const runs = await octokit.paginate(octokit.rest.actions.listWorkflowRuns, {
      ...github.context.repo,
      workflow_id: workflowId,
      head_sha: headSha,
      per_page: 100,
    });

    return runs.map((run) => ({
      id: run.id,
      runNumber: run.run_number,
      runAttempt: run.run_attempt ?? 1,
      checkSuiteId: run.check_suite_id ?? null,
      completed: run.status === "completed",
      conclusion: run.conclusion,
      event: run.event,
    }));
  },
};

const tracker = new ReplacementTracker(actionsApi, core.warning);

export const fetchCheckRuns = async (): Promise<RelevantCheckRuns> => {
  const iterator = octokit.paginate.iterator(octokit.rest.checks.listForRef, {
    ...github.context.repo,
    ref: inputs.ref,
    per_page: 100,
  });

  const runs: CheckRun[] = [];

  for await (const { data } of iterator) {
    for (const run of data) {
      const selfMatch = inputs.caseSensitive
        ? run.name === inputs.name
        : run.name.toLowerCase() === inputs.name.toLowerCase();

      if (selfMatch || inputs.ignored.matches(run.name)) {
        continue;
      }

      runs.push(run);
    }
  }

  tracker.startPoll();

  return selectCheckRuns(runs, async (run) => tracker.replacements(run));
};
