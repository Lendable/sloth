import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Octokit } from "@octokit/core";
import { IgnoreMatcher } from "./ignore-matcher";

const mockPaginateIterator = vi.fn();
const mockOctokit = {
  paginate: { iterator: mockPaginateIterator },
  rest: { checks: { listForRef: vi.fn() } },
} as unknown as Octokit;

vi.mock("@actions/github", () => ({
  getOctokit: vi.fn(() => mockOctokit),
  context: { repo: { owner: "test-owner", repo: "test-repo" } },
}));

vi.mock("./inputs", () => ({
  inputs: {
    token: "fake-token",
    name: "sloth",
    ignored: new IgnoreMatcher(["ignored-check"]),
    ref: "main",
  },
}));

const { fetchCheckRuns } = await import("./fetch-check-runs");

describe("fetchCheckRuns", () => {
  beforeEach(() => {
    mockPaginateIterator.mockReset();
  });

  it("filters out the action's own check run and ignored checks", async () => {
    mockPaginateIterator.mockImplementation(async function* () {
      yield {
        data: [
          { name: "test-check-1", status: "completed", conclusion: "success", completed_at: "2024-01-01", started_at: null },
          { name: "sloth", status: "completed", conclusion: "success", completed_at: "2024-01-01", started_at: null },
          { name: "ignored-check", status: "completed", conclusion: "success", completed_at: "2024-01-01", started_at: null },
          { name: "test-check-2", status: "in_progress", conclusion: null, completed_at: null, started_at: "2024-01-01" },
        ],
      };
    });

    const result = await fetchCheckRuns();

    expect(result.total()).toBe(2);
    expect(result.succeeded).toEqual(["test-check-1"]);
    expect(result.pending).toEqual(["test-check-2"]);
    expect(result.failed).toEqual([]);
  });

  it("paginates across multiple pages", async () => {
    mockPaginateIterator.mockImplementation(async function* () {
      yield { data: [{ name: "check-1", status: "completed", conclusion: "success", completed_at: "2024-01-01", started_at: null }] };
      yield { data: [{ name: "check-2", status: "completed", conclusion: "success", completed_at: "2024-01-01", started_at: null }] };
    });

    const result = await fetchCheckRuns();
    expect(result.total()).toBe(2);
    expect(result.succeeded).toEqual(["check-1", "check-2"]);
  });

  it("returns empty results when no check runs are found", async () => {
    mockPaginateIterator.mockImplementation(async function* () {
      yield { data: [] };
    });

    const result = await fetchCheckRuns();
    expect(result.total()).toBe(0);
  });

  it("identifies overall failure when any run has failed", async () => {
    mockPaginateIterator.mockImplementation(async function* () {
      yield {
        data: [
          { name: "test-1", status: "completed", conclusion: "failure", completed_at: "2024-01-01", started_at: null },
          { name: "test-2", status: "completed", conclusion: "success", completed_at: "2024-01-01", started_at: null },
        ],
      };
    });

    const result = await fetchCheckRuns();
    expect(result.isOverallFailure()).toBe(true);
  });

  it("identifies overall success when all runs have passed", async () => {
    mockPaginateIterator.mockImplementation(async function* () {
      yield {
        data: [
          { name: "test-1", status: "completed", conclusion: "success", completed_at: "2024-01-01", started_at: null },
          { name: "test-2", status: "completed", conclusion: "success", completed_at: "2024-01-01", started_at: null },
        ],
      };
    });

    const result = await fetchCheckRuns();
    expect(result.isOverallSuccess()).toBe(true);
  });
});
