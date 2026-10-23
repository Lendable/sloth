import type { CheckRun } from "./fetch-check-runs";

export interface WorkflowJob {
  runId: number;
  runAttempt: number;
  headSha: string;
}

export interface WorkflowRun {
  id: number;
  runNumber: number;
  runAttempt: number;
  checkSuiteId: number | null;
  completed: boolean;
  conclusion: string | null;
}

export interface ActionsApi {
  getJob: (jobId: number) => Promise<WorkflowJob>;
  getWorkflowId: (runId: number) => Promise<number>;
  listRuns: (workflowId: number, headSha: string) => Promise<WorkflowRun[]>;
}

/** A newer run, or a newer attempt, of a cancelled check run's workflow on the same commit. */
export interface Replacement {
  /** Its check runs belong to this check suite. A run's attempts share one. */
  checkSuiteId: number | null;
  /**
   * It has concluded, and Sloth has listed check runs since it saw that, so the
   * listing includes every check run it created.
   */
  settled: boolean;
  /** It concluded with `success`, `neutral` or `skipped`. */
  succeeded: boolean;
}

const successfulConclusions = ["success", "neutral", "skipped"];

/**
 * Finds the newer runs, or newer attempts, of a cancelled GitHub Actions check run's
 * workflow on the same commit.
 *
 * This happens when a `concurrency` group cancels a workflow run in favour of a newer
 * one, but also when an older run is cancelled by hand. Jobs and workflow IDs never
 * change, so they are looked up once. The workflow's runs are listed at most once per
 * poll, and on every poll, because a settled replacement can be re-run.
 */
export class ReplacementTracker {
  private readonly jobs = new Map<number, Promise<WorkflowJob>>();
  private readonly workflowIds = new Map<number, Promise<number>>();
  /** The poll in which each workflow run attempt was first seen completed. */
  private readonly completedSince = new Map<string, number>();
  private poll = 0;
  private runsThisPoll = new Map<string, Promise<WorkflowRun[]>>();

  constructor(
    private readonly api: ActionsApi,
    private readonly warn: (message: string) => void,
  ) {}

  /** Call after listing the poll's check runs, before asking for any replacements. */
  startPoll(): void {
    this.poll++;
    this.runsThisPoll = new Map();
  }

  /**
   * Returns the replacements newest first, or none when the check run was not
   * cancelled by GitHub Actions or nothing replaced its workflow run.
   *
   * A lookup that fails counts as no replacement, so the cancelled check run still
   * fails Sloth.
   */
  async replacements(checkRun: CheckRun): Promise<Replacement[]> {
    if (
      checkRun.conclusion !== "cancelled" ||
      checkRun.app?.slug !== "github-actions"
    ) {
      return [];
    }

    try {
      return await this.lookUp(checkRun);
    } catch (error) {
      const hint = isMissingPermission(error)
        ? " Sloth needs the `actions: read` permission for this."
        : "";

      this.warn(
        `Could not check whether cancelled check run "${checkRun.name}" was replaced by a newer workflow run, so it counts as a failure.${hint} ${error instanceof Error ? error.message : String(error)}`,
      );

      return [];
    }
  }

  private async lookUp(checkRun: CheckRun): Promise<Replacement[]> {
    // A GitHub Actions check run has the same ID as the job that produced it.
    const job = await memoize(this.jobs, checkRun.id, async () =>
      this.api.getJob(checkRun.id),
    );
    const workflowId = await memoize(this.workflowIds, job.runId, async () =>
      this.api.getWorkflowId(job.runId),
    );
    const runs = await memoize(
      this.runsThisPoll,
      `${workflowId}:${job.headSha}`,
      async () => this.api.listRuns(workflowId, job.headSha),
    );

    for (const run of runs) {
      if (run.completed && !this.completedSince.has(attemptOf(run))) {
        this.completedSince.set(attemptOf(run), this.poll);
      }
    }

    const cancelledRun = runs.find((run) => run.id === job.runId);

    if (!cancelledRun) {
      return [];
    }

    const replacements = runs
      .filter((run) => run.runNumber > cancelledRun.runNumber)
      .sort((a, b) => b.runNumber - a.runNumber);

    if (job.runAttempt < cancelledRun.runAttempt) {
      replacements.push(cancelledRun);
    }

    return replacements.map((run) => ({
      checkSuiteId: run.checkSuiteId,
      settled:
        (this.completedSince.get(attemptOf(run)) ?? this.poll) < this.poll,
      succeeded: successfulConclusions.includes(run.conclusion ?? ""),
    }));
  }
}

/**
 * A re-run keeps the run's ID, so completion is tracked per attempt: a new attempt
 * is not settled until it has itself completed and Sloth has polled again since.
 */
function attemptOf(run: WorkflowRun): string {
  return `${run.id}/${run.runAttempt}`;
}

/** Shares one lookup between everyone asking for the same key. */
async function memoize<K, V>(
  cache: Map<K, Promise<V>>,
  key: K,
  load: () => Promise<V>,
): Promise<V> {
  let value = cache.get(key);

  if (!value) {
    value = load();
    cache.set(key, value);
  }

  return value;
}

function isMissingPermission(error: unknown): boolean {
  return (
    error instanceof Error &&
    "status" in error &&
    error.status === 403 &&
    error.message.includes("Resource not accessible by integration")
  );
}
