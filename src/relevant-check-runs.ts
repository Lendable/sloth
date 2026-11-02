import { CheckRun } from "./fetch-check-runs";

const failureConclusions = ["failure", "cancelled", "timed_out"];

export class RelevantCheckRuns {
  readonly pending: CheckRun["name"][] = [];
  readonly failed: CheckRun["name"][] = [];
  readonly succeeded: CheckRun["name"][] = [];
  readonly awaitingReplacement: CheckRun["name"][];
  readonly superseded: CheckRun["name"][];

  /**
   * @param awaitingReplacement cancelled check runs whose workflow run has a newer
   *   run that is still in progress or has only just concluded; they count as
   *   pending.
   * @param superseded names whose most recent check run was cancelled and replaced
   *   by a newer workflow run that succeeded without running the job again; they
   *   count as succeeded, like skipped check runs.
   */
  constructor(
    all: CheckRun[],
    awaitingReplacement: CheckRun[] = [],
    superseded: CheckRun["name"][] = [],
  ) {
    for (const run of all) {
      if (!run.conclusion) {
        this.pending.push(run.name);
      } else if (failureConclusions.includes(run.conclusion)) {
        this.failed.push(run.name);
      } else {
        this.succeeded.push(run.name);
      }
    }

    this.awaitingReplacement = awaitingReplacement.map((run) => run.name);
    this.superseded = [...superseded];

    this.pending.sort();
    this.failed.sort();
    this.succeeded.sort();
    this.awaitingReplacement.sort();
    this.superseded.sort();
  }

  isOverallFailure(): boolean {
    return this.failed.length > 0;
  }

  isOverallSuccess(): boolean {
    return (
      !this.isOverallFailure() &&
      this.pending.length === 0 &&
      this.awaitingReplacement.length === 0 &&
      this.succeeded.length + this.superseded.length > 0
    );
  }

  total(): number {
    return (
      this.pending.length +
      this.failed.length +
      this.succeeded.length +
      this.awaitingReplacement.length +
      this.superseded.length
    );
  }
}
