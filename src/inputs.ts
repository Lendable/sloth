import * as core from "@actions/core";

const interval = Number(core.getInput("interval"));

export class Inputs {
  readonly token: string;
  readonly name: string;
  readonly interval: number;
  readonly timeout: number;
  readonly ref: string;
  readonly ignored: Set<string>;

  constructor() {
    if (!Number.isInteger(interval)) {
      throw new Error("Invalid interval");
    }

    if (interval < 1) {
      throw new Error("Interval must be greater than 0");
    }

    const timeout = Number(core.getInput("timeout"));

    if (!Number.isInteger(timeout)) {
      throw new Error("Invalid timeout");
    }

    if (timeout < 1) {
      throw new Error("Timeout must be greater than 0");
    }

    this.token = core.getInput("token", { required: true });
    this.name = core.getInput("name");
    this.interval = interval;
    this.timeout = timeout;
    this.ref = core.getInput("ref");
    this.ignored = new Set(core.getMultilineInput("ignored"));
  }
}
