import * as github from "@actions/github";
import type { components } from "@octokit/openapi-types";
import { RelevantCheckRuns } from "./relevant-check-runs";
import { GitHub } from "@actions/github/lib/utils";

export type CheckRun = components["schemas"]["check-run"];

export class CheckRunFetcher {
  private octokit: InstanceType<typeof GitHub> | null = null;

  constructor(
    private token: string,
    private ref: string,
    private ownName: string,
    private ignoredChecks: Set<string>,
  ) {}

  async fetch(): Promise<RelevantCheckRuns> {
    this.octokit ??= github.getOctokit(this.token);

    const iterator = this.octokit.paginate.iterator(
      this.octokit.rest.checks.listForRef,
      {
        ...github.context.repo,
        ref: this.ref,
        per_page: 100,
      },
    );

    let runs: CheckRun[] = [];

    for await (const { data } of iterator) {
      runs = runs.concat(data);
    }

    return new RelevantCheckRuns(
      runs.filter(
        (run) => run.name !== this.ownName && !this.ignoredChecks.has(run.name),
      ),
    );
  }
}
