/**
 * Converts glob-style ignore patterns into an efficient check-run name matcher.
 *
 * Patterns containing `*` are treated as wildcards (matching any sequence of
 * characters). Patterns without wildcards are matched exactly. All comparisons
 * are case-sensitive.
 */
export class IgnoreMatcher {
  private readonly exactNames: Set<string>;
  private readonly wildcardPatterns: { source: string; regex: RegExp }[];

  constructor(patterns: string[]) {
    this.exactNames = new Set<string>();
    this.wildcardPatterns = [];

    for (const pattern of patterns) {
      if (pattern.includes("*")) {
        this.wildcardPatterns.push({
          source: pattern,
          regex: toRegex(pattern),
        });
      } else {
        this.exactNames.add(pattern);
      }
    }
  }

  /** Returns true if the given check run name matches any ignored pattern. */
  matches(name: string): boolean {
    if (this.exactNames.has(name)) {
      return true;
    }

    return this.wildcardPatterns.some(({ regex }) => regex.test(name));
  }

  /** Returns the raw patterns for display/logging purposes. */
  get patterns(): string[] {
    return [
      ...this.exactNames,
      ...this.wildcardPatterns.map(({ source }) => source),
    ];
  }

  get size(): number {
    return this.exactNames.size + this.wildcardPatterns.length;
  }
}

/** Escapes regex special characters except `*`, then replaces `*` with `.*`. */
function toRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regexStr = escaped.replace(/\*/g, ".*");

  return new RegExp(`^${regexStr}$`);
}
