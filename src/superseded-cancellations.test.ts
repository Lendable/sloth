import { describe, it, expect, vi } from "vitest";
import {
  ActionsApi,
  Replacement,
  ReplacementTracker,
  WorkflowRun,
} from "./superseded-cancellations";
import type { CheckRun } from "./fetch-check-runs";

const headSha = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";

function stubCheckRun(
  id: number,
  conclusion: string | null = "cancelled",
  appSlug = "github-actions",
): CheckRun {
  return {
    id,
    name: `job-${id}`,
    conclusion,
    app: { slug: appSlug },
  } as CheckRun;
}

/** Run number N has ID 1000 + N and check suite 2000 + N. */
function workflowRun(
  runNumber: number,
  overrides: Partial<WorkflowRun> = {},
): WorkflowRun {
  const completed = overrides.completed ?? true;

  return {
    id: 1000 + runNumber,
    runNumber,
    runAttempt: 1,
    checkSuiteId: 2000 + runNumber,
    completed,
    conclusion: completed ? "success" : null,
    event: "pull_request",
    ...overrides,
  };
}

/**
 * Fakes the Actions API for jobs of `cancelledRun` (workflow 7); `runs` are all
 * runs of that workflow on the commit.
 */
function createApi(
  cancelledRun: WorkflowRun,
  runs: WorkflowRun[],
  jobRunAttempt = 1,
): ActionsApi {
  return {
    getJob: vi.fn().mockResolvedValue({
      runId: cancelledRun.id,
      runAttempt: jobRunAttempt,
      headSha,
    }),
    getWorkflowId: vi.fn().mockResolvedValue(7),
    listRuns: vi.fn().mockResolvedValue(runs),
  };
}

/** Asks for check run 100's replacements once in each of `polls` polls. */
async function overPolls(
  tracker: ReplacementTracker,
  polls: number,
): Promise<Replacement[][]> {
  const replacements = [];

  for (let poll = 0; poll < polls; poll++) {
    tracker.startPoll();
    replacements.push(await tracker.replacements(stubCheckRun(100)));
  }

  return replacements;
}

function replacement(
  checkSuiteId: number,
  settled: boolean,
  succeeded: boolean,
): Replacement {
  return { checkSuiteId, settled, succeeded };
}

describe("ReplacementTracker", () => {
  it("does not look up check runs that were not cancelled", async () => {
    const run = workflowRun(1);
    const api = createApi(run, [run]);
    const tracker = new ReplacementTracker(api, vi.fn());

    expect(await tracker.replacements(stubCheckRun(100, "failure"))).toEqual(
      [],
    );
    expect(await tracker.replacements(stubCheckRun(101, null))).toEqual([]);
    expect(api.getJob).not.toHaveBeenCalled();
  });

  it("does not look up cancelled check runs not created by GitHub Actions", async () => {
    const run = workflowRun(1);
    const api = createApi(run, [run]);
    const tracker = new ReplacementTracker(api, vi.fn());

    expect(
      await tracker.replacements(
        stubCheckRun(100, "cancelled", "some-other-ci"),
      ),
    ).toEqual([]);
    expect(api.getJob).not.toHaveBeenCalled();
  });

  it("finds no replacements when no newer run of the workflow exists", async () => {
    const run = workflowRun(2);
    const api = createApi(run, [workflowRun(1), run]);

    expect(await overPolls(new ReplacementTracker(api, vi.fn()), 1)).toEqual([
      [],
    ]);
  });

  it("finds a newer run of the workflow in progress", async () => {
    const run = workflowRun(2);
    const api = createApi(run, [
      workflowRun(1),
      run,
      workflowRun(3, { completed: false }),
    ]);

    expect(await overPolls(new ReplacementTracker(api, vi.fn()), 1)).toEqual([
      [replacement(2003, false, false)],
    ]);
    expect(api.getJob).toHaveBeenCalledWith(100);
    expect(api.getWorkflowId).toHaveBeenCalledWith(run.id);
    expect(api.listRuns).toHaveBeenCalledWith(7, headSha);
  });

  it("lists the newer runs newest first", async () => {
    const run = workflowRun(1);
    const api = createApi(run, [
      workflowRun(3, { completed: false }),
      run,
      workflowRun(2),
    ]);

    expect(await overPolls(new ReplacementTracker(api, vi.fn()), 1)).toEqual([
      [replacement(2003, false, false), replacement(2002, false, true)],
    ]);
  });

  it("ignores newer runs of the workflow triggered by another event", async () => {
    const run = workflowRun(1);
    const api = createApi(run, [
      run,
      workflowRun(2, { event: "push" }),
      workflowRun(3, { completed: false }),
      workflowRun(4, { event: "workflow_dispatch" }),
    ]);

    expect(await overPolls(new ReplacementTracker(api, vi.fn()), 1)).toEqual([
      [replacement(2003, false, false)],
    ]);
  });

  it("settles a newer run from the poll after it was first seen concluded", async () => {
    const run = workflowRun(1);
    const api = createApi(run, [
      run,
      workflowRun(2),
      workflowRun(3, { completed: false }),
    ]);

    expect(await overPolls(new ReplacementTracker(api, vi.fn()), 2)).toEqual([
      [replacement(2003, false, false), replacement(2002, false, true)],
      [replacement(2003, false, false), replacement(2002, true, true)],
    ]);
  });

  it.each(["cancelled", "failure", "startup_failure"])(
    "reports a newer run that concluded with %s as not succeeded",
    async (conclusion) => {
      const run = workflowRun(1);
      const api = createApi(run, [run, workflowRun(2, { conclusion })]);

      expect(await overPolls(new ReplacementTracker(api, vi.fn()), 2)).toEqual([
        [replacement(2002, false, false)],
        [replacement(2002, true, false)],
      ]);
    },
  );

  it("finds a re-run attempt of the workflow run, after any newer run", async () => {
    const run = workflowRun(1, { runAttempt: 2, completed: false });
    const api = createApi(run, [run, workflowRun(2)]);

    expect(await overPolls(new ReplacementTracker(api, vi.fn()), 2)).toEqual([
      [replacement(2002, false, true), replacement(2001, false, false)],
      [replacement(2002, true, true), replacement(2001, false, false)],
    ]);
  });

  it("settles a re-run attempt once it has concluded", async () => {
    const run = workflowRun(1, { runAttempt: 2 });
    const api = createApi(run, [run]);

    expect(await overPolls(new ReplacementTracker(api, vi.fn()), 2)).toEqual([
      [replacement(2001, false, true)],
      [replacement(2001, true, true)],
    ]);
  });

  it("looks up jobs and workflows once, and lists runs once per poll", async () => {
    const run = workflowRun(1);
    const api = createApi(run, [run, workflowRun(2, { completed: false })]);
    const tracker = new ReplacementTracker(api, vi.fn());

    for (let poll = 0; poll < 2; poll++) {
      tracker.startPoll();
      await Promise.all([
        tracker.replacements(stubCheckRun(100)),
        tracker.replacements(stubCheckRun(101)),
      ]);
    }

    expect(api.getJob).toHaveBeenCalledTimes(2);
    expect(api.getWorkflowId).toHaveBeenCalledTimes(1);
    expect(api.listRuns).toHaveBeenCalledTimes(2);
  });

  it("lists runs every poll, even once the replacements have settled", async () => {
    const run = workflowRun(1);
    const api = createApi(run, [run, workflowRun(2)]);

    expect(await overPolls(new ReplacementTracker(api, vi.fn()), 3)).toEqual([
      [replacement(2002, false, true)],
      [replacement(2002, true, true)],
      [replacement(2002, true, true)],
    ]);
    expect(api.listRuns).toHaveBeenCalledTimes(3);
  });

  it("unsettles a replacement that is re-run, and settles it a poll after the new attempt concludes", async () => {
    const run = workflowRun(1);
    const api = createApi(run, []);
    const cancelled = workflowRun(2, { conclusion: "cancelled" });
    const rerunning = workflowRun(2, {
      runAttempt: 2,
      completed: false,
      conclusion: null,
    });
    const rerun = workflowRun(2, { runAttempt: 2 });
    api.listRuns = vi
      .fn()
      .mockResolvedValueOnce([run, cancelled])
      .mockResolvedValueOnce([run, cancelled])
      .mockResolvedValueOnce([run, rerunning])
      .mockResolvedValue([run, rerun]);

    expect(await overPolls(new ReplacementTracker(api, vi.fn()), 5)).toEqual([
      [replacement(2002, false, false)],
      [replacement(2002, true, false)],
      [replacement(2002, false, false)],
      [replacement(2002, false, true)],
      [replacement(2002, true, true)],
    ]);
  });

  it("waits a poll after a re-run attempt concludes, even if it ran entirely between polls", async () => {
    const run = workflowRun(1);
    const api = createApi(run, []);
    api.listRuns = vi
      .fn()
      .mockResolvedValueOnce([run, workflowRun(2, { conclusion: "cancelled" })])
      .mockResolvedValue([run, workflowRun(2, { runAttempt: 2 })]);

    expect(await overPolls(new ReplacementTracker(api, vi.fn()), 3)).toEqual([
      [replacement(2002, false, false)],
      [replacement(2002, false, true)],
      [replacement(2002, true, true)],
    ]);
  });

  it("warns about the missing permission when the token cannot read Actions", async () => {
    const run = workflowRun(1);
    const api = createApi(run, [run]);
    api.getJob = vi.fn().mockRejectedValue(
      Object.assign(new Error("Resource not accessible by integration"), {
        status: 403,
      }),
    );
    const warn = vi.fn();

    expect(await overPolls(new ReplacementTracker(api, warn), 1)).toEqual([[]]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("`actions: read`"),
    );
  });

  it.each([
    ["getWorkflowId", 500, "Server Error"],
    ["listRuns", 403, "API rate limit exceeded"],
  ] as const)(
    "warns without a permission hint when %s fails with %i %s",
    async (method, status, message) => {
      const run = workflowRun(1);
      const api = createApi(run, [run]);
      api[method] = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error(message), { status }));
      const warn = vi.fn();

      expect(await overPolls(new ReplacementTracker(api, warn), 1)).toEqual([
        [],
      ]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(message));
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining("`actions: read`"),
      );
    },
  );
});
