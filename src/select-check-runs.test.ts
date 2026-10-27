import { describe, it, expect, vi } from "vitest";
import { selectCheckRuns } from "./select-check-runs";
import {
  type ActionsApi,
  type Replacement,
  ReplacementTracker,
  type WorkflowRun,
} from "./superseded-cancellations";
import type { CheckRun } from "./fetch-check-runs";

function stubCheckRun(
  id: number,
  name: string,
  conclusion: string | null,
  completedAt: string | null,
  checkSuiteId = 1,
  startedAt: string | null = completedAt,
): CheckRun {
  return {
    id,
    name,
    conclusion,
    completed_at: completedAt,
    started_at: startedAt,
    check_suite: { id: checkSuiteId },
  } as CheckRun;
}

/** Replacements (newest first) by check run ID; any other check run has none. */
function replacements(
  byId: Record<number, Replacement[]> = {},
): (run: CheckRun) => Promise<Replacement[]> {
  return async (run) => byId[run.id] ?? [];
}

function pending(checkSuiteId: number): Replacement {
  return { checkSuiteId, settled: false, succeeded: false };
}

function settled(checkSuiteId: number, succeeded = true): Replacement {
  return { checkSuiteId, settled: true, succeeded };
}

describe("selectCheckRuns", () => {
  it("uses the most recent check run for each name", async () => {
    const runs = await selectCheckRuns(
      [
        stubCheckRun(1, "lint", "failure", "2026-10-23T20:00:00Z"),
        stubCheckRun(2, "lint", "success", "2026-10-23T20:05:00Z"),
        stubCheckRun(3, "test", "success", "2026-10-23T20:10:00Z"),
        stubCheckRun(4, "test", null, null, 1, "2026-10-23T20:11:00Z"),
      ],
      replacements(),
    );

    expect(runs.succeeded).toEqual(["lint"]);
    expect(runs.pending).toEqual(["test"]);
  });

  it("treats a check run without timestamps as the most recent", async () => {
    const runs = await selectCheckRuns(
      [
        stubCheckRun(1, "lint", null, null),
        stubCheckRun(2, "lint", "failure", "2026-10-23T20:05:00Z"),
      ],
      replacements(),
    );

    expect(runs.failed).toEqual(["lint"]);
  });

  it("fails on a cancellation that nothing replaced", async () => {
    const runs = await selectCheckRuns(
      [stubCheckRun(1, "validate", "cancelled", "2026-10-23T20:21:17Z")],
      replacements(),
    );

    expect(runs.failed).toEqual(["validate"]);
  });

  it("awaits a replacement that has no result for the check yet", async () => {
    const runs = await selectCheckRuns(
      [
        stubCheckRun(1, "validate", "cancelled", "2026-10-23T20:21:17Z"),
        stubCheckRun(2, "lint", "success", "2026-10-23T20:21:20Z"),
      ],
      replacements({ 1: [pending(2)] }),
    );

    expect(runs.awaitingReplacement).toEqual(["validate"]);
    expect(runs.failed).toEqual([]);
    expect(runs.isOverallSuccess()).toBe(false);
  });

  it("uses the replacement's own result when it finished before the cancellation", async () => {
    const runs = await selectCheckRuns(
      [
        stubCheckRun(1, "test", "failure", "2026-10-23T10:05:00Z", 2),
        stubCheckRun(2, "test", "cancelled", "2026-10-23T10:06:00Z", 1),
      ],
      replacements({ 2: [settled(2)] }),
    );

    expect(runs.failed).toEqual(["test"]);
  });

  it("uses the replacement's own result even if the replacement did not succeed", async () => {
    const runs = await selectCheckRuns(
      [
        stubCheckRun(1, "test", "success", "2026-10-23T10:05:00Z", 2),
        stubCheckRun(2, "test", "cancelled", "2026-10-23T10:06:00Z", 1),
      ],
      replacements({ 2: [settled(2, false)] }),
    );

    expect(runs.succeeded).toEqual(["test"]);
    expect(runs.isOverallSuccess()).toBe(true);
  });

  it("uses the replacement's own result while the replacement is still in progress", async () => {
    const runs = await selectCheckRuns(
      [
        stubCheckRun(1, "test", "success", "2026-10-23T10:05:00Z", 2),
        stubCheckRun(2, "test", "cancelled", "2026-10-23T10:06:00Z", 1),
      ],
      replacements({ 2: [pending(2)] }),
    );

    expect(runs.succeeded).toEqual(["test"]);
  });

  it("awaits a newer replacement without a result rather than using an older replacement's", async () => {
    const runs = await selectCheckRuns(
      [
        stubCheckRun(1, "test", "success", "2026-10-23T10:05:00Z", 2),
        stubCheckRun(2, "test", "cancelled", "2026-10-23T10:06:00Z", 1),
      ],
      replacements({ 2: [pending(3), settled(2)] }),
    );

    expect(runs.awaitingReplacement).toEqual(["test"]);
    expect(runs.isOverallSuccess()).toBe(false);
  });

  it("uses an older replacement's result once newer ones settled without one", async () => {
    const runs = await selectCheckRuns(
      [
        stubCheckRun(1, "test", "success", "2026-10-23T10:05:00Z", 2),
        stubCheckRun(2, "test", "cancelled", "2026-10-23T10:06:00Z", 1),
      ],
      replacements({ 2: [settled(3, false), settled(2)] }),
    );

    expect(runs.succeeded).toEqual(["test"]);
  });

  it("prefers the newest replacement's result over a more recent one from an older replacement", async () => {
    const runs = await selectCheckRuns(
      [
        stubCheckRun(1, "test", "success", "2026-10-23T10:04:00Z", 3),
        stubCheckRun(2, "test", "failure", "2026-10-23T10:05:00Z", 2),
        stubCheckRun(3, "test", "cancelled", "2026-10-23T10:06:00Z", 1),
      ],
      replacements({ 3: [settled(3), settled(2)] }),
    );

    expect(runs.succeeded).toEqual(["test"]);
  });

  it("checks a replacement's own cancelled check run for replacements too", async () => {
    const runs = await selectCheckRuns(
      [
        stubCheckRun(1, "test", "cancelled", "2026-10-23T10:05:00Z", 2),
        stubCheckRun(2, "test", "cancelled", "2026-10-23T10:06:00Z", 1),
      ],
      replacements({ 2: [settled(2)], 1: [pending(3)] }),
    );

    expect(runs.awaitingReplacement).toEqual(["test"]);
  });

  it("supersedes a check that a successful replacement did not run, whatever older runs did", async () => {
    const runs = await selectCheckRuns(
      [
        stubCheckRun(1, "validate", "failure", "2026-10-23T20:00:00Z", 0),
        stubCheckRun(2, "validate", "cancelled", "2026-10-23T20:21:17Z", 1),
        stubCheckRun(3, "lint", "success", "2026-10-23T20:21:20Z", 2),
      ],
      replacements({ 2: [settled(2)] }),
    );

    expect(runs.superseded).toEqual(["validate"]);
    expect(runs.failed).toEqual([]);
    expect(runs.isOverallSuccess()).toBe(true);
  });

  it("keeps the cancellation when an unsuccessful replacement did not run the check, whatever older runs did", async () => {
    const runs = await selectCheckRuns(
      [
        stubCheckRun(1, "validate", "success", "2026-10-23T20:00:00Z", 0),
        stubCheckRun(2, "validate", "cancelled", "2026-10-23T20:21:17Z", 1),
      ],
      replacements({ 2: [settled(2, false)] }),
    );

    expect(runs.failed).toEqual(["validate"]);
  });

  it("awaits a re-run of the cancelled run rather than using a result from its earlier attempts", async () => {
    // A run's attempts share one check suite.
    const runs = await selectCheckRuns(
      [
        stubCheckRun(1, "test", "success", "2026-10-23T20:00:00Z", 1),
        stubCheckRun(2, "test", "cancelled", "2026-10-23T20:21:17Z", 1),
      ],
      replacements({ 2: [pending(1)] }),
    );

    expect(runs.awaitingReplacement).toEqual(["test"]);
    expect(runs.isOverallSuccess()).toBe(false);
  });

  describe("with a ReplacementTracker", () => {
    /** Run N of workflow 7 has ID 1000 + N and check suite 2000 + N. */
    function workflowRun(
      runNumber: number,
      overrides: Partial<WorkflowRun> = {},
    ): WorkflowRun {
      return {
        id: 1000 + runNumber,
        runNumber,
        runAttempt: 1,
        checkSuiteId: 2000 + runNumber,
        completed: true,
        conclusion: "success",
        event: "pull_request",
        ...overrides,
      };
    }

    /**
     * Check run 1 is a job of run 1, which was cancelled. Each poll lists the next
     * set of workflow runs; the last set is reused after that.
     */
    function trackerOver(...runsPerPoll: WorkflowRun[][]): ReplacementTracker {
      const listRuns = vi.fn();

      for (const runs of runsPerPoll) {
        listRuns.mockResolvedValueOnce(runs);
      }

      listRuns.mockResolvedValue(runsPerPoll[runsPerPoll.length - 1]);

      const api: ActionsApi = {
        getJob: vi.fn().mockResolvedValue({
          runId: 1001,
          runAttempt: 1,
          headSha: "a1b2c3d",
        }),
        getWorkflowId: vi.fn().mockResolvedValue(7),
        listRuns,
      };

      return new ReplacementTracker(api, vi.fn());
    }

    const cancelledRun = workflowRun(1, { conclusion: "cancelled" });

    function cancelledCheckRun(): CheckRun {
      return {
        ...stubCheckRun(
          1,
          "validate",
          "cancelled",
          "2026-10-23T20:21:17Z",
          2001,
        ),
        app: { slug: "github-actions" },
      } as CheckRun;
    }

    async function poll(
      tracker: ReplacementTracker,
      runs: CheckRun[],
    ): Promise<ReturnType<typeof selectCheckRuns>> {
      tracker.startPoll();

      return selectCheckRuns(runs, async (run) => tracker.replacements(run));
    }

    it("fails once the newer run turns out to have been cancelled before running any job", async () => {
      const tracker = trackerOver([
        cancelledRun,
        workflowRun(2, { conclusion: "cancelled" }),
      ]);

      const first = await poll(tracker, [cancelledCheckRun()]);
      const second = await poll(tracker, [cancelledCheckRun()]);

      expect(first.awaitingReplacement).toEqual(["validate"]);
      expect(second.failed).toEqual(["validate"]);
    });

    it("lists the check runs again before relying on a newer run that has succeeded", async () => {
      const tracker = trackerOver([cancelledRun, workflowRun(2)]);

      // The newer run concluded after this poll listed the check runs, so the
      // listing may lack the check runs it created.
      const first = await poll(tracker, [cancelledCheckRun()]);
      const second = await poll(tracker, [
        cancelledCheckRun(),
        stubCheckRun(2, "validate", "failure", "2026-10-23T20:21:30Z", 2002),
      ]);

      expect(first.awaitingReplacement).toEqual(["validate"]);
      expect(first.isOverallSuccess()).toBe(false);
      expect(second.failed).toEqual(["validate"]);
    });

    it("passes on the newer run's own success even when the newer run failed", async () => {
      const tracker = trackerOver([
        cancelledRun,
        workflowRun(2, { conclusion: "failure" }),
      ]);

      const runs = await poll(tracker, [
        stubCheckRun(2, "validate", "success", "2026-10-23T20:21:10Z", 2002),
        cancelledCheckRun(),
      ]);

      expect(runs.succeeded).toEqual(["validate"]);
      expect(runs.isOverallSuccess()).toBe(true);
    });

    it("fails when only a run triggered by another event followed the cancelled one", async () => {
      // The job only runs for pull requests, so the push run skipped it.
      const tracker = trackerOver([
        cancelledRun,
        workflowRun(2, { event: "push" }),
      ]);

      const runs = await poll(tracker, [
        stubCheckRun(2, "validate", "skipped", "2026-10-23T20:21:10Z", 2002),
        cancelledCheckRun(),
      ]);

      expect(runs.failed).toEqual(["validate"]);
    });

    it("does not pass on a result from an attempt older than the cancelled one", async () => {
      // The job was cancelled in attempt 2 of run 1. Attempt 3 has not created its
      // check run yet, but attempt 1's is in the same check suite.
      const tracker = new ReplacementTracker(
        {
          getJob: vi.fn().mockResolvedValue({
            runId: 1001,
            runAttempt: 2,
            headSha: "a1b2c3d",
          }),
          getWorkflowId: vi.fn().mockResolvedValue(7),
          listRuns: vi.fn().mockResolvedValue([
            workflowRun(1, {
              runAttempt: 3,
              completed: false,
              conclusion: null,
            }),
          ]),
        },
        vi.fn(),
      );

      const runs = await poll(tracker, [
        stubCheckRun(2, "validate", "success", "2026-10-23T20:00:00Z", 2001),
        cancelledCheckRun(),
      ]);

      expect(runs.awaitingReplacement).toEqual(["validate"]);
      expect(runs.isOverallSuccess()).toBe(false);
    });

    it("waits for the newest run instead of passing on an older replacement's success", async () => {
      const tracker = trackerOver(
        [
          cancelledRun,
          workflowRun(2),
          workflowRun(3, { completed: false, conclusion: null }),
        ],
        [
          cancelledRun,
          workflowRun(2),
          workflowRun(3, { conclusion: "failure" }),
        ],
      );
      const olderSuccess = stubCheckRun(
        2,
        "validate",
        "success",
        "2026-10-23T20:21:10Z",
        2002,
      );

      const first = await poll(tracker, [olderSuccess, cancelledCheckRun()]);
      const second = await poll(tracker, [
        olderSuccess,
        cancelledCheckRun(),
        stubCheckRun(3, "validate", "failure", "2026-10-23T20:21:40Z", 2003),
      ]);

      expect(first.awaitingReplacement).toEqual(["validate"]);
      expect(first.isOverallSuccess()).toBe(false);
      expect(second.failed).toEqual(["validate"]);
    });

    it("keeps waiting when an unsuccessful newer run is re-run", async () => {
      const tracker = trackerOver(
        [cancelledRun, workflowRun(2, { conclusion: "cancelled" })],
        [
          cancelledRun,
          workflowRun(2, { runAttempt: 2, completed: false, conclusion: null }),
        ],
        [cancelledRun, workflowRun(2, { runAttempt: 2 })],
      );

      const first = await poll(tracker, [cancelledCheckRun()]);
      const second = await poll(tracker, [cancelledCheckRun()]);
      const third = await poll(tracker, [
        cancelledCheckRun(),
        stubCheckRun(2, "validate", "success", "2026-10-23T20:23:00Z", 2002),
      ]);

      expect(first.awaitingReplacement).toEqual(["validate"]);
      expect(second.awaitingReplacement).toEqual(["validate"]);
      expect(second.failed).toEqual([]);
      expect(third.succeeded).toEqual(["validate"]);
    });
  });
});
