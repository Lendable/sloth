import * as core from "@actions/core";
import { IgnoreMatcher } from "./ignore-matcher";

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

const emptySettleTime = Number(core.getInput("empty-settle-time"));

if (!Number.isInteger(emptySettleTime)) {
  throw new Error("Invalid empty-settle-time");
}

if (emptySettleTime < 0) {
  throw new Error("empty-settle-time must be 0 or greater");
}

export const inputs = {
  token: core.getInput("token", { required: true }),
  name: core.getInput("name"),
  interval,
  timeout,
  ref: core.getInput("ref"),
  ignored: new IgnoreMatcher(core.getMultilineInput("ignored")),
  allowEmpty: core.getBooleanInput("allow-empty"),
  emptySettleTime,
} as const;
