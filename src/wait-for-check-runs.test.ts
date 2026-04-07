import { describe, it, expect, vi } from "vitest";
import {
  waitForCheckRuns,
  WaitDependencies,
  WaitOptions,
} from "./wait-for-check-runs";
import { RelevantCheckRuns } from "./relevant-check-runs";
import type { CheckRun } from "./fetch-check-runs";

function stubCheckRun(name: string, conclusion: string | null): CheckRun {
  return { name, conclusion } as CheckRun;
}

function emptyRuns(): RelevantCheckRuns {
  return new RelevantCheckRuns([]);
}

function successRuns(): RelevantCheckRuns {
  return new RelevantCheckRuns([stubCheckRun("lint", "success")]);
}

function pendingRuns(): RelevantCheckRuns {
  return new RelevantCheckRuns([stubCheckRun("lint", null)]);
}

function failedRuns(): RelevantCheckRuns {
  return new RelevantCheckRuns([stubCheckRun("lint", "failure")]);
}

function createDeps(
  overrides: Partial<WaitDependencies> = {},
): WaitDependencies {
  return {
    fetchCheckRuns: vi.fn().mockResolvedValue(successRuns()),
    delay: vi.fn().mockResolvedValue(undefined),
    elapsedSeconds: vi.fn().mockReturnValue(0),
    onSuccess: vi.fn(),
    onEmptySuccess: vi.fn(),
    onFailure: vi.fn(),
    onTimeout: vi.fn(),
    onDelaying: vi.fn(),
    onIterationStart: vi.fn(),
    onDisplayCheckRuns: vi.fn(),
    ...overrides,
  };
}

function createOpts(overrides: Partial<WaitOptions> = {}): WaitOptions {
  return {
    interval: 10,
    timeout: 600,
    allowEmpty: false,
    emptySettleTime: 30,
    ...overrides,
  };
}

describe("waitForCheckRuns", () => {
  describe("standard behaviour", () => {
    it("succeeds when all checks pass", async () => {
      const deps = createDeps();
      await waitForCheckRuns(deps, createOpts());

      expect(deps.onSuccess).toHaveBeenCalledOnce();
      expect(deps.onFailure).not.toHaveBeenCalled();
      expect(deps.onTimeout).not.toHaveBeenCalled();
    });

    it("fails when a check has failed", async () => {
      const deps = createDeps({
        fetchCheckRuns: vi.fn().mockResolvedValue(failedRuns()),
      });

      await waitForCheckRuns(deps, createOpts());

      expect(deps.onFailure).toHaveBeenCalledWith("A check run failed.");
      expect(deps.onSuccess).not.toHaveBeenCalled();
    });

    it("polls while checks are pending then succeeds", async () => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(pendingRuns())
        .mockResolvedValueOnce(successRuns());

      const deps = createDeps({ fetchCheckRuns: fetch });

      await waitForCheckRuns(deps, createOpts());

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(deps.onDelaying).toHaveBeenCalledOnce();
      expect(deps.onSuccess).toHaveBeenCalledOnce();
    });

    it("times out when checks never complete", async () => {
      let elapsed = 0;
      const deps = createDeps({
        fetchCheckRuns: vi.fn().mockResolvedValue(pendingRuns()),
        elapsedSeconds: vi.fn().mockImplementation(() => elapsed),
        delay: vi.fn().mockImplementation(async () => {
          elapsed += 10;
        }),
      });

      await waitForCheckRuns(deps, createOpts({ timeout: 25 }));

      expect(deps.onTimeout).toHaveBeenCalledWith(
        "Timed out waiting on check runs to all be successful.",
      );
      expect(deps.onSuccess).not.toHaveBeenCalled();
    });
  });

  describe("allow-empty disabled (default)", () => {
    it("keeps polling when no checks are found and eventually times out", async () => {
      let elapsed = 0;
      const deps = createDeps({
        fetchCheckRuns: vi.fn().mockResolvedValue(emptyRuns()),
        elapsedSeconds: vi.fn().mockImplementation(() => elapsed),
        delay: vi.fn().mockImplementation(async () => {
          elapsed += 10;
        }),
      });

      await waitForCheckRuns(
        deps,
        createOpts({ allowEmpty: false, timeout: 25 }),
      );

      expect(deps.onTimeout).toHaveBeenCalled();
      expect(deps.onEmptySuccess).not.toHaveBeenCalled();
      expect(deps.onSuccess).not.toHaveBeenCalled();
    });
  });

  describe("allow-empty enabled", () => {
    it("succeeds after settle time when no checks are found", async () => {
      let elapsed = 0;
      const deps = createDeps({
        fetchCheckRuns: vi.fn().mockResolvedValue(emptyRuns()),
        elapsedSeconds: vi.fn().mockImplementation(() => elapsed),
        delay: vi.fn().mockImplementation(async () => {
          elapsed += 10;
        }),
      });

      await waitForCheckRuns(
        deps,
        createOpts({ allowEmpty: true, emptySettleTime: 30 }),
      );

      expect(deps.onEmptySuccess).toHaveBeenCalledOnce();
      expect(deps.onSuccess).not.toHaveBeenCalled();
      expect(deps.onTimeout).not.toHaveBeenCalled();
    });

    it("does not succeed before settle time has elapsed", async () => {
      let elapsed = 0;
      const fetchCalls: number[] = [];
      const deps = createDeps({
        fetchCheckRuns: vi.fn().mockImplementation(async () => {
          fetchCalls.push(elapsed);
          return emptyRuns();
        }),
        elapsedSeconds: vi.fn().mockImplementation(() => elapsed),
        delay: vi.fn().mockImplementation(async () => {
          elapsed += 10;
        }),
      });

      await waitForCheckRuns(
        deps,
        createOpts({ allowEmpty: true, emptySettleTime: 30 }),
      );

      // Should have polled multiple times before accepting empty
      expect(fetchCalls.length).toBeGreaterThan(1);
      // The first few polls should have waited, not accepted empty
      expect(fetchCalls[0]).toBeLessThan(30);
      expect(deps.onDelaying).toHaveBeenCalled();
      expect(deps.onEmptySuccess).toHaveBeenCalledOnce();
    });

    it("resumes normal behaviour when checks appear during settle period", async () => {
      let elapsed = 0;
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(emptyRuns()) // first poll: empty
        .mockResolvedValueOnce(emptyRuns()) // second poll: still empty
        .mockResolvedValueOnce(successRuns()); // third poll: checks appeared

      const deps = createDeps({
        fetchCheckRuns: fetch,
        elapsedSeconds: vi.fn().mockImplementation(() => elapsed),
        delay: vi.fn().mockImplementation(async () => {
          elapsed += 10;
        }),
      });

      await waitForCheckRuns(
        deps,
        createOpts({ allowEmpty: true, emptySettleTime: 30 }),
      );

      expect(deps.onSuccess).toHaveBeenCalledOnce();
      expect(deps.onEmptySuccess).not.toHaveBeenCalled();
    });

    it("fails when checks appear during settle period and fail", async () => {
      let elapsed = 0;
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(emptyRuns()) // first poll: empty
        .mockResolvedValueOnce(failedRuns()); // second poll: failed check

      const deps = createDeps({
        fetchCheckRuns: fetch,
        elapsedSeconds: vi.fn().mockImplementation(() => elapsed),
        delay: vi.fn().mockImplementation(async () => {
          elapsed += 10;
        }),
      });

      await waitForCheckRuns(
        deps,
        createOpts({ allowEmpty: true, emptySettleTime: 30 }),
      );

      expect(deps.onFailure).toHaveBeenCalledWith("A check run failed.");
      expect(deps.onEmptySuccess).not.toHaveBeenCalled();
    });

    it("succeeds immediately with settle time of 0", async () => {
      const deps = createDeps({
        fetchCheckRuns: vi.fn().mockResolvedValue(emptyRuns()),
        elapsedSeconds: vi.fn().mockReturnValue(0),
      });

      await waitForCheckRuns(
        deps,
        createOpts({ allowEmpty: true, emptySettleTime: 0 }),
      );

      expect(deps.onEmptySuccess).toHaveBeenCalledOnce();
      expect(deps.delay).not.toHaveBeenCalled();
    });

    it("still times out if settle time exceeds timeout", async () => {
      let elapsed = 0;
      const deps = createDeps({
        fetchCheckRuns: vi.fn().mockResolvedValue(emptyRuns()),
        elapsedSeconds: vi.fn().mockImplementation(() => elapsed),
        delay: vi.fn().mockImplementation(async () => {
          elapsed += 10;
        }),
      });

      await waitForCheckRuns(
        deps,
        createOpts({
          allowEmpty: true,
          emptySettleTime: 60,
          timeout: 25,
        }),
      );

      expect(deps.onTimeout).toHaveBeenCalled();
      expect(deps.onEmptySuccess).not.toHaveBeenCalled();
    });
  });
});
