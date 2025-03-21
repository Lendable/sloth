import { CheckRun } from "./fetch-check-runs";

const failureConclusions = ["failure", "cancelled", "timed_out"];

export class RelevantCheckRuns {
  readonly pending: CheckRun["name"][] = [];
  readonly failed: CheckRun["name"][] = [];
  readonly succeeded: CheckRun["name"][] = [];

  constructor(all: CheckRun[]) {
    for (const run of all) {
      if (!run.conclusion) {
        this.pending.push(run.name);
      } else if (failureConclusions.includes(run.conclusion)) {
        this.failed.push(run.name);
      } else {
        this.succeeded.push(run.name);
      }
    }

    this.pending.sort();
    this.failed.sort();
    this.succeeded.sort();
  }

  isOverallFailure(): boolean {
    return this.failed.length > 0;
  }

  isOverallSuccess(): boolean {
    return (
      !this.isOverallFailure() &&
      this.pending.length === 0 &&
      this.succeeded.length > 0
    );
  }

  total(): number {
    return this.pending.length + this.failed.length + this.succeeded.length;
  }
}
