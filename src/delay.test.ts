import { describe, it, expect, vi, afterEach } from "vitest";
import { delay } from "./delay";

describe("delay", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after the specified number of seconds", async () => {
    vi.useFakeTimers();

    const promise = delay(2);

    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toBeUndefined();
  });

  it("does not resolve before the specified time", async () => {
    vi.useFakeTimers();

    let resolved = false;
    const track = async (): Promise<void> => {
      await delay(5);
      resolved = true;
    };

    const promise = track();

    await vi.advanceTimersByTimeAsync(3000);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(2000);
    await promise;
    expect(resolved).toBe(true);
  });
});
