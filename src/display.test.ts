import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as core from "@actions/core";
import { Display } from "./display";
import { RelevantCheckRuns } from "./relevant-check-runs";
import type { CheckRun } from "./fetch-check-runs";

vi.mock("@actions/core");

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
} as const;

describe("Display", () => {
  let consoleInfo: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfo.mockRestore();
  });

  describe("timedOut", () => {
    it("prints timeout message", () => {
      Display.timedOut();
      expect(consoleInfo).toHaveBeenNthCalledWith(1, "");
      expect(consoleInfo).toHaveBeenNthCalledWith(
        2,
        `⏰ ${colors.red}Timed out!${colors.reset}`,
      );
    });
  });

  describe("delaying", () => {
    it("prints delay message with the given seconds", () => {
      Display.delaying(10);
      expect(consoleInfo).toHaveBeenCalledWith("🦥 Inspecting again in 10s...");
    });
  });

  describe("overallFailure", () => {
    it("prints failure message", () => {
      Display.overallFailure();
      expect(consoleInfo).toHaveBeenNthCalledWith(1, "");
      expect(consoleInfo).toHaveBeenNthCalledWith(
        2,
        `❗ ${colors.red}Failure!${colors.reset}`,
      );
    });
  });

  describe("overallSuccess", () => {
    it("prints success message", () => {
      Display.overallSuccess();
      expect(consoleInfo).toHaveBeenNthCalledWith(1, "");
      expect(consoleInfo).toHaveBeenNthCalledWith(
        2,
        `🚀 ${colors.green}Success!${colors.reset}`,
      );
    });
  });

  describe("startingIteration", () => {
    it("prints an empty line", () => {
      Display.startingIteration();
      expect(consoleInfo).toHaveBeenCalledWith("");
    });
  });

  describe("ignoredCheckPatterns", () => {
    it("groups and prints patterns when present", () => {
      Display.ignoredCheckPatterns(["check1", "check2"]);
      expect(core.startGroup).toHaveBeenCalledWith("Ignored check patterns");
      expect(consoleInfo).toHaveBeenNthCalledWith(1, "check1");
      expect(consoleInfo).toHaveBeenNthCalledWith(2, "check2");
      expect(core.endGroup).toHaveBeenCalled();
    });

    it("prints nothing when the list is empty", () => {
      Display.ignoredCheckPatterns([]);
      expect(core.startGroup).not.toHaveBeenCalled();
      expect(consoleInfo).not.toHaveBeenCalled();
      expect(core.endGroup).not.toHaveBeenCalled();
    });
  });

  describe("relevantCheckRuns", () => {
    function stubRun(name: string, conclusion: string | null): CheckRun {
      return { name, conclusion } as CheckRun;
    }

    it("groups each non-empty category with counts and icons", () => {
      const runs = new RelevantCheckRuns([
        stubRun("success-check", "success"),
        stubRun("failed-check", "failure"),
        stubRun("pending-check", null),
      ]);

      Display.relevantCheckRuns(runs);

      expect(core.startGroup).toHaveBeenNthCalledWith(
        1,
        `✅ ${colors.green}1${colors.reset}`,
      );
      expect(consoleInfo).toHaveBeenNthCalledWith(1, "success-check");

      expect(core.startGroup).toHaveBeenNthCalledWith(
        2,
        `❌ ${colors.red}1${colors.reset}`,
      );
      expect(consoleInfo).toHaveBeenNthCalledWith(2, "failed-check");

      expect(core.startGroup).toHaveBeenNthCalledWith(
        3,
        `⏳ ${colors.reset}1${colors.reset}`,
      );
      expect(consoleInfo).toHaveBeenNthCalledWith(3, "pending-check");
    });

    it("skips empty categories", () => {
      const runs = new RelevantCheckRuns([stubRun("success-check", "success")]);

      Display.relevantCheckRuns(runs);

      expect(core.startGroup).toHaveBeenCalledTimes(1);
      expect(core.startGroup).toHaveBeenCalledWith(
        `✅ ${colors.green}1${colors.reset}`,
      );
    });
  });
});
