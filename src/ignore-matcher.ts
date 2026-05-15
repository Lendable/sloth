/**
 * Converts glob-style ignore patterns into an efficient check-run name matcher.
 *
 * Patterns containing `*` are treated as wildcards (matching any sequence of
 * characters). Patterns without wildcards are matched exactly. Comparisons are
 * case-sensitive by default; pass `caseSensitive: false` to opt in to
 * case-insensitive matching.
 */
export class IgnoreMatcher {
  private readonly exactNames: Map<string, string>; // lookup key → original
  private readonly wildcardPatterns: { source: string; regex: RegExp }[];
  private readonly caseSensitive: boolean;

  constructor(patterns: string[], caseSensitive: boolean = true) {
    this.caseSensitive = caseSensitive;
    this.exactNames = new Map<string, string>();
    this.wildcardPatterns = [];

    for (const pattern of patterns) {
      if (pattern.includes("*")) {
        this.wildcardPatterns.push({
          source: pattern,
          regex: toRegex(pattern, caseSensitive),
        });
      } else {
        const key = caseSensitive ? pattern : pattern.toLowerCase();
        this.exactNames.set(key, pattern);
      }
    }
  }

  /** Returns true if the given check run name matches any ignored pattern. */
  matches(name: string): boolean {
    const key = this.caseSensitive ? name : name.toLowerCase();

    if (this.exactNames.has(key)) {
      return true;
    }

    return this.wildcardPatterns.some(({ regex }) => regex.test(name));
  }

  /** Returns the raw patterns for display/logging purposes. */
  get patterns(): string[] {
    return [
      ...this.exactNames.values(),
      ...this.wildcardPatterns.map(({ source }) => source),
    ];
  }

  get size(): number {
    return this.exactNames.size + this.wildcardPatterns.length;
  }
}

/** Escapes regex special characters except `*`, then replaces `*` with `.*`. */
function toRegex(pattern: string, caseSensitive: boolean): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regexStr = escaped.replace(/\*/g, ".*");

  return new RegExp(`^${regexStr}$`, caseSensitive ? "" : "i");
}
