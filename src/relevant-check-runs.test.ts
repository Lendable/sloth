import { describe, it, expect } from "vitest";
import { RelevantCheckRuns } from "./relevant-check-runs";
import type { CheckRun } from "./fetch-check-runs";

/** Creates a minimal check run stub with only the fields RelevantCheckRuns reads. */
function stubCheckRun(name: string, conclusion: string | null): CheckRun {
  return { name, conclusion } as CheckRun;
}

describe("RelevantCheckRuns", () => {
  it("classifies a run without conclusion as pending", () => {
    const runs = new RelevantCheckRuns([stubCheckRun("lint", null)]);

    expect(runs.pending).toEqual(["lint"]);
    expect(runs.succeeded).toEqual([]);
    expect(runs.failed).toEqual([]);
  });

  it("classifies a successful run", () => {
    const runs = new RelevantCheckRuns([stubCheckRun("lint", "success")]);

    expect(runs.succeeded).toEqual(["lint"]);
    expect(runs.pending).toEqual([]);
    expect(runs.failed).toEqual([]);
  });

  it("classifies failure conclusions correctly", () => {
    const runs = new RelevantCheckRuns([
      stubCheckRun("build", "failure"),
      stubCheckRun("deploy", "cancelled"),
      stubCheckRun("e2e", "timed_out"),
    ]);

    expect(runs.failed).toEqual(["build", "deploy", "e2e"]);
    expect(runs.succeeded).toEqual([]);
    expect(runs.pending).toEqual([]);
  });

  it("treats skipped and neutral as succeeded", () => {
    const runs = new RelevantCheckRuns([
      stubCheckRun("optional", "skipped"),
      stubCheckRun("info", "neutral"),
    ]);

    expect(runs.succeeded).toEqual(["info", "optional"]);
    expect(runs.failed).toEqual([]);
  });

  it("sorts names alphabetically within each category", () => {
    const runs = new RelevantCheckRuns([
      stubCheckRun("z-lint", "success"),
      stubCheckRun("a-test", "success"),
      stubCheckRun("m-build", null),
      stubCheckRun("b-deploy", null),
    ]);

    expect(runs.succeeded).toEqual(["a-test", "z-lint"]);
    expect(runs.pending).toEqual(["b-deploy", "m-build"]);
  });

  describe("isOverallFailure", () => {
    it("returns true when any run has failed", () => {
      const runs = new RelevantCheckRuns([
        stubCheckRun("lint", "success"),
        stubCheckRun("build", "failure"),
      ]);

      expect(runs.isOverallFailure()).toBe(true);
    });

    it("returns false when no runs have failed", () => {
      const runs = new RelevantCheckRuns([
        stubCheckRun("lint", "success"),
        stubCheckRun("build", null),
      ]);

      expect(runs.isOverallFailure()).toBe(false);
    });
  });

  describe("isOverallSuccess", () => {
    it("returns true when all runs succeeded and none pending", () => {
      const runs = new RelevantCheckRuns([
        stubCheckRun("lint", "success"),
        stubCheckRun("build", "success"),
      ]);

      expect(runs.isOverallSuccess()).toBe(true);
    });

    it("returns false when runs are still pending", () => {
      const runs = new RelevantCheckRuns([
        stubCheckRun("lint", "success"),
        stubCheckRun("build", null),
      ]);

      expect(runs.isOverallSuccess()).toBe(false);
    });

    it("returns false when a run has failed", () => {
      const runs = new RelevantCheckRuns([
        stubCheckRun("lint", "success"),
        stubCheckRun("build", "failure"),
      ]);

      expect(runs.isOverallSuccess()).toBe(false);
    });

    it("returns false when there are no runs at all", () => {
      const runs = new RelevantCheckRuns([]);

      expect(runs.isOverallSuccess()).toBe(false);
    });
  });

  describe("total", () => {
    it("returns the sum of all categories", () => {
      const runs = new RelevantCheckRuns([
        stubCheckRun("a", "success"),
        stubCheckRun("b", "failure"),
        stubCheckRun("c", null),
      ]);

      expect(runs.total()).toBe(3);
    });

    it("returns 0 for empty input", () => {
      const runs = new RelevantCheckRuns([]);

      expect(runs.total()).toBe(0);
    });
  });
});
