export const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
} as const;

export type Color = (typeof colors)[keyof typeof colors];
