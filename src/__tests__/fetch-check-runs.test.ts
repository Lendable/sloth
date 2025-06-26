import { describe, expect, jest, it } from "@jest/globals";
import type { Octokit } from "@octokit/core";

const mockPaginateIterator = jest.fn();
const mockOctokit = {
  paginate: {
    iterator: mockPaginateIterator,
  },
  rest: {
    checks: {
      listForRef: jest.fn(),
    },
  },
} as unknown as Octokit;

jest.mock("@actions/github", () => ({
  getOctokit: jest.fn(() => mockOctokit),
  context: {
    repo: {
      owner: "test-owner",
      repo: "test-repo",
    },
  },
}));

jest.mock("../inputs", () => ({
  inputs: {
    token: "fake-token",
    name: "sloth",
    ignored: new Set(["ignored-check"]),
    ref: "main",
  },
}));

// eslint-disable-next-line import/first
import { fetchCheckRuns } from "../fetch-check-runs";

describe("fetchCheckRuns", () => {
  it("should fetch and filter check runs correctly", async () => {
    const mockCheckRuns = [
      { name: "test-check-1", status: "completed", conclusion: "success" },
      { name: "sloth", status: "completed", conclusion: "success" },
      { name: "ignored-check", status: "completed", conclusion: "success" },
      { name: "test-check-2", status: "in_progress" },
    ];

    mockPaginateIterator.mockImplementation(async function* () {
      yield { data: mockCheckRuns };
    });

    const result = await fetchCheckRuns();

    expect(result).toBeDefined();
    expect(mockPaginateIterator).toHaveBeenCalledWith(expect.any(Function), {
      owner: "test-owner",
      repo: "test-repo",
      ref: "main",
      per_page: 100,
    });

    expect(result.total()).toBe(2);
    expect(result.succeeded).toEqual(["test-check-1"]);
    expect(result.pending).toEqual(["test-check-2"]);
    expect(result.failed).toEqual([]);
  });

  it("should handle multiple pages of results", async () => {
    const page1 = [
      { name: "check-1", status: "completed", conclusion: "success" },
    ];
    const page2 = [
      { name: "check-2", status: "completed", conclusion: "success" },
    ];

    mockPaginateIterator.mockImplementation(async function* () {
      yield { data: page1 };
      yield { data: page2 };
    });

    const result = await fetchCheckRuns();
    expect(result.total()).toBe(2);
    expect(result.succeeded).toEqual(["check-1", "check-2"]);
  });

  it("should handle empty results", async () => {
    mockPaginateIterator.mockImplementation(async function* () {
      yield { data: [] };
    });

    const result = await fetchCheckRuns();
    expect(result.total()).toBe(0);
  });

  it("should correctly identify overall failure", async () => {
    const mockCheckRuns = [
      { name: "test-1", status: "completed", conclusion: "failure" },
      { name: "test-2", status: "completed", conclusion: "success" },
    ];

    mockPaginateIterator.mockImplementation(async function* () {
      yield { data: mockCheckRuns };
    });

    const result = await fetchCheckRuns();
    expect(result.isOverallFailure()).toBe(true);
  });

  it("should correctly identify overall success", async () => {
    const mockCheckRuns = [
      { name: "test-1", status: "completed", conclusion: "success" },
      { name: "test-2", status: "completed", conclusion: "success" },
    ];

    mockPaginateIterator.mockImplementation(async function* () {
      yield { data: mockCheckRuns };
    });

    const result = await fetchCheckRuns();
    expect(result.isOverallSuccess()).toBe(true);
  });
});
