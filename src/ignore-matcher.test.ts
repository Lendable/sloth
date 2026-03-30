import { describe, it, expect } from "vitest";
import { IgnoreMatcher } from "./ignore-matcher";

describe("IgnoreMatcher", () => {
  describe("exact matching", () => {
    it("matches an exact check run name", () => {
      const matcher = new IgnoreMatcher(["lint", "typecheck"]);

      expect(matcher.matches("lint")).toBe(true);
      expect(matcher.matches("typecheck")).toBe(true);
    });

    it("does not match names that differ", () => {
      const matcher = new IgnoreMatcher(["lint"]);

      expect(matcher.matches("linter")).toBe(false);
      expect(matcher.matches("Lint")).toBe(false);
      expect(matcher.matches("")).toBe(false);
    });
  });

  describe("wildcard matching", () => {
    it("matches a trailing wildcard", () => {
      const matcher = new IgnoreMatcher(["deploy / *"]);

      expect(matcher.matches("deploy / staging")).toBe(true);
      expect(matcher.matches("deploy / production")).toBe(true);
      expect(matcher.matches("deploy / ")).toBe(true);
    });

    it("matches a leading wildcard", () => {
      const matcher = new IgnoreMatcher(["* / deploy"]);

      expect(matcher.matches("frontend / deploy")).toBe(true);
      expect(matcher.matches("backend / deploy")).toBe(true);
    });

    it("matches multiple wildcards", () => {
      const matcher = new IgnoreMatcher(["* / deploy / *-staging / *"]);

      expect(
        matcher.matches("frontend / deploy / eu-staging / deploy-eu-staging"),
      ).toBe(true);
      expect(
        matcher.matches("backend / deploy / us-staging / deploy-us-staging"),
      ).toBe(true);
      expect(
        matcher.matches("api / deploy / ap-staging / deploy-ap-staging"),
      ).toBe(true);
    });

    it("does not match when the non-wildcard segments differ", () => {
      const matcher = new IgnoreMatcher(["* / deploy / *-staging / *"]);

      expect(
        matcher.matches("frontend / build / eu-staging / build-eu-staging"),
      ).toBe(false);
    });

    it("does not match a production job against a staging pattern", () => {
      const matcher = new IgnoreMatcher(["* / deploy / *-staging / *"]);

      expect(
        matcher.matches(
          "frontend / deploy / eu-production / deploy-eu-production",
        ),
      ).toBe(false);
    });

    it("matches a single wildcard in the middle", () => {
      const matcher = new IgnoreMatcher(["deploy-*-staging"]);

      expect(matcher.matches("deploy-api-staging")).toBe(true);
      expect(matcher.matches("deploy-web-staging")).toBe(true);
      expect(matcher.matches("deploy-api-production")).toBe(false);
    });

    it("handles a bare wildcard matching everything", () => {
      const matcher = new IgnoreMatcher(["*"]);

      expect(matcher.matches("anything")).toBe(true);
      expect(matcher.matches("")).toBe(true);
    });
  });

  describe("mixed exact and wildcard patterns", () => {
    it("matches either exact or wildcard entries", () => {
      const matcher = new IgnoreMatcher(["lint", "* / deploy / *-staging / *"]);

      expect(matcher.matches("lint")).toBe(true);
      expect(
        matcher.matches("frontend / deploy / eu-staging / deploy-eu-staging"),
      ).toBe(true);
      expect(matcher.matches("typecheck")).toBe(false);
    });
  });

  describe("regex special characters in patterns", () => {
    it("treats regex special characters as literals", () => {
      const matcher = new IgnoreMatcher(["check (optional)"]);

      expect(matcher.matches("check (optional)")).toBe(true);
      expect(matcher.matches("check optional")).toBe(false);
    });

    it("escapes dots in patterns", () => {
      const matcher = new IgnoreMatcher(["v1.2.3-*"]);

      expect(matcher.matches("v1.2.3-beta")).toBe(true);
      expect(matcher.matches("v1X2Y3-beta")).toBe(false);
    });
  });

  describe("empty patterns", () => {
    it("matches nothing when given no patterns", () => {
      const matcher = new IgnoreMatcher([]);

      expect(matcher.matches("anything")).toBe(false);
      expect(matcher.size).toBe(0);
    });
  });

  describe("size", () => {
    it("reports the total number of patterns", () => {
      const matcher = new IgnoreMatcher(["lint", "* / deploy / *"]);

      expect(matcher.size).toBe(2);
    });
  });

  describe("patterns", () => {
    it("returns the original patterns for display", () => {
      const matcher = new IgnoreMatcher(["lint", "* / deploy / *"]);

      expect(matcher.patterns).toEqual(["lint", "* / deploy / *"]);
    });
  });
});
