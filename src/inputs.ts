import * as core from "@actions/core";

const interval = Number(core.getInput("interval"));

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

export const inputs = {
  token: core.getInput("token", { required: true }),
  name: core.getInput("name"),
  interval,
  timeout,
  ref: core.getInput("ref"),
  ignored: new Set(core.getMultilineInput("ignored")),
} as const;
