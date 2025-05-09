import { delay } from "../delay";

describe("delay", () => {
  let spySetTimeout: jest.SpyInstance;

  beforeEach(() => {
    // Mock setTimeout to make tests run faster
    jest.useFakeTimers();
    spySetTimeout = jest.spyOn(global, "setTimeout");
  });

  afterEach(() => {
    // Restore original setTimeout after each test
    jest.useRealTimers();
  });

  it("should delay for the specified number of seconds", async () => {
    const delayPromise = delay(5);

    // Fast-forward time by 5 seconds
    jest.advanceTimersByTime(5000);

    await delayPromise;

    // Verify setTimeout was called with correct duration
    expect(jest.getTimerCount()).toBe(0); // All timers should have completed
    expect(spySetTimeout).toHaveBeenCalledTimes(1);
    expect(spySetTimeout).toHaveBeenLastCalledWith(expect.any(Function), 5000);
  });

  it("should resolve after the delay", async () => {
    const delayPromise = delay(2);

    // Fast-forward time by 2 seconds
    jest.advanceTimersByTime(2000);

    await delayPromise;

    expect(spySetTimeout).toHaveBeenCalledTimes(1);
    expect(spySetTimeout).toHaveBeenLastCalledWith(expect.any(Function), 2000);
  });

  it("should handle zero seconds", async () => {
    const delayPromise = delay(0);

    jest.advanceTimersByTime(0);

    await delayPromise;

    expect(spySetTimeout).toHaveBeenCalledTimes(1);
    expect(spySetTimeout).toHaveBeenLastCalledWith(expect.any(Function), 0);
  });

  it("should handle decimal seconds", async () => {
    const delayPromise = delay(1.5);

    jest.advanceTimersByTime(1500);

    await delayPromise;

    expect(spySetTimeout).toHaveBeenCalledTimes(1);
    expect(spySetTimeout).toHaveBeenLastCalledWith(expect.any(Function), 1500);
  });
});
