import * as core from "@actions/core";
import { Display } from "../display";
import { RelevantCheckRuns } from "../relevant-check-runs";

// Mock @actions/core
jest.mock("@actions/core");

describe("Display", () => {
  const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
  };

  let mockConsoleInfo: jest.SpyInstance;

  beforeEach(() => {
    // Setup console.info mock
    mockConsoleInfo = jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.info
    mockConsoleInfo.mockRestore();
  });

  describe("timedOut", () => {
    it("should display timeout message", () => {
      Display.timedOut();
      expect(mockConsoleInfo).toHaveBeenNthCalledWith(1, "");
      expect(mockConsoleInfo).toHaveBeenNthCalledWith(
        2,
        `⏰ ${colors.red}Timed out!${colors.reset}`,
      );
    });
  });

  describe("delaying", () => {
    it("should display delay message with seconds", () => {
      Display.delaying(10);
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        "🦥 Inspecting again in 10s...",
      );
    });
  });

  describe("overallFailure", () => {
    it("should display failure message", () => {
      Display.overallFailure();
      expect(mockConsoleInfo).toHaveBeenNthCalledWith(1, "");
      expect(mockConsoleInfo).toHaveBeenNthCalledWith(
        2,
        `❗ ${colors.red}Failure!${colors.reset}`,
      );
    });
  });

  describe("overallSuccess", () => {
    it("should display success message", () => {
      Display.overallSuccess();
      expect(mockConsoleInfo).toHaveBeenNthCalledWith(1, "");
      expect(mockConsoleInfo).toHaveBeenNthCalledWith(
        2,
        `🚀 ${colors.green}Success!${colors.reset}`,
      );
    });
  });

  describe("startingIteration", () => {
    it("should display empty line", () => {
      Display.startingIteration();
      expect(mockConsoleInfo).toHaveBeenCalledWith("");
    });
  });

  describe("ignoredCheckNames", () => {
    it("should display ignored check names when present", () => {
      const ignoredNames = new Set(["check1", "check2"]);
      Display.ignoredCheckNames(ignoredNames);

      expect(core.startGroup).toHaveBeenCalledWith("Ignored check names");
      expect(mockConsoleInfo).toHaveBeenNthCalledWith(1, "check1");
      expect(mockConsoleInfo).toHaveBeenNthCalledWith(2, "check2");
      expect(core.endGroup).toHaveBeenCalled();
    });

    it("should not display anything when no ignored checks", () => {
      const ignoredNames = new Set<string>();
      Display.ignoredCheckNames(ignoredNames);

      expect(core.startGroup).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(core.endGroup).not.toHaveBeenCalled();
    });
  });

  describe("relevantCheckRuns", () => {
    it("should display all check run categories with correct formatting", () => {
      const checkRuns: RelevantCheckRuns = {
        succeeded: ["success-check"],
        failed: ["failed-check"],
        pending: ["pending-check"],
        total: () => 3,
        isOverallSuccess: () => false,
        isOverallFailure: () => false,
      };

      Display.relevantCheckRuns(checkRuns);

      // Verify succeeded checks display
      expect(core.startGroup).toHaveBeenNthCalledWith(
        1,
        `✅ ${colors.green}1${colors.reset}`,
      );
      expect(mockConsoleInfo).toHaveBeenNthCalledWith(1, "success-check");

      // Verify failed checks display
      expect(core.startGroup).toHaveBeenNthCalledWith(
        2,
        `❌ ${colors.red}1${colors.reset}`,
      );
      expect(mockConsoleInfo).toHaveBeenNthCalledWith(2, "failed-check");

      // Verify pending checks display
      expect(core.startGroup).toHaveBeenNthCalledWith(
        3,
        `⏳ ${colors.reset}1${colors.reset}`,
      );
      expect(mockConsoleInfo).toHaveBeenNthCalledWith(3, "pending-check");
    });

    it("should not display empty categories", () => {
      const checkRuns: RelevantCheckRuns = {
        succeeded: ["success-check"],
        failed: [],
        pending: [],
        total: () => 1,
        isOverallSuccess: () => false,
        isOverallFailure: () => false,
      };

      Display.relevantCheckRuns(checkRuns);

      // Should only display succeeded checks
      expect(core.startGroup).toHaveBeenCalledTimes(1);
      expect(core.startGroup).toHaveBeenCalledWith(
        `✅ ${colors.green}1${colors.reset}`,
      );
      expect(mockConsoleInfo).toHaveBeenCalledWith("success-check");
    });
  });
});
