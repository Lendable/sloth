import type { CheckRun } from "./fetch-check-runs";
import { RelevantCheckRuns } from "./relevant-check-runs";
import type { Replacement } from "./superseded-cancellations";

type Selection =
  | { kind: "latest"; run: CheckRun }
  | { kind: "awaiting-replacement"; run: CheckRun }
  | { kind: "superseded"; name: CheckRun["name"] };

/**
 * Picks one check run per name: the most recent one. This is necessary because the
 * GitHub API can return multiple runs for the same check (e.g., when a check is
 * re-run), even with filter: "latest".
 *
 * A cancelled check run whose workflow run has been replaced is not the result for
 * its name. Going through the replacements newest first, the first one with its own
 * check run with that name provides the result, even if that finished before the
 * cancellation. A replacement without one that has not settled yet could still create
 * one, so the check awaits it. If no replacement has one, the check is superseded if
 * the newest replacement succeeded, and stands as cancelled if it did not.
 */
export async function selectCheckRuns(
  all: CheckRun[],
  replacementsOf: (run: CheckRun) => Promise<Replacement[]>,
): Promise<RelevantCheckRuns> {
  const runsByName = new Map<CheckRun["name"], CheckRun[]>();

  for (const run of all) {
    runsByName.set(run.name, [...(runsByName.get(run.name) ?? []), run]);
  }

  const selections = await Promise.all(
    Array.from(runsByName.entries(), async ([name, runs]) =>
      selectForName(name, runs, replacementsOf),
    ),
  );

  const latest: CheckRun[] = [];
  const awaitingReplacement: CheckRun[] = [];
  const superseded: CheckRun["name"][] = [];

  for (const selection of selections) {
    if (selection.kind === "latest") {
      latest.push(selection.run);
    } else if (selection.kind === "awaiting-replacement") {
      awaitingReplacement.push(selection.run);
    } else {
      superseded.push(selection.name);
    }
  }

  return new RelevantCheckRuns(latest, awaitingReplacement, superseded);
}

async function selectForName(
  name: CheckRun["name"],
  runs: CheckRun[],
  replacementsOf: (run: CheckRun) => Promise<Replacement[]>,
): Promise<Selection> {
  // Never empty: it starts as every run with the name and only narrows to a
  // replacement's own runs when there are some.
  let candidates = runs;

  while (true) {
    const run = mostRecent(candidates);
    const replacements = await replacementsOf(run);

    if (replacements.length === 0) {
      return { kind: "latest", run };
    }

    const next = fromReplacements(name, run, candidates, replacements);

    if (!Array.isArray(next)) {
      return next;
    }

    candidates = next;
  }
}

/**
 * Returns the check runs of the newest replacement that has its own runs with the
 * cancelled check run's name, unless a newer replacement could still create some.
 */
function fromReplacements(
  name: CheckRun["name"],
  cancelled: CheckRun,
  candidates: CheckRun[],
  replacements: Replacement[],
): CheckRun[] | Selection {
  for (const replacement of replacements) {
    const own = candidates.filter(
      (candidate) =>
        candidate !== cancelled &&
        replacement.checkSuiteId !== null &&
        candidate.check_suite?.id === replacement.checkSuiteId,
    );

    if (own.length > 0) {
      return own;
    }

    if (!replacement.settled) {
      return { kind: "awaiting-replacement", run: cancelled };
    }
  }

  return replacements[0].succeeded
    ? { kind: "superseded", name }
    : { kind: "latest", run: cancelled };
}

/**
 * The run with the latest `completed_at` (or `started_at`). A run with neither has
 * not started yet: it wins over the runs listed before it, and so do the runs
 * listed after it.
 */
function mostRecent(runs: CheckRun[]): CheckRun {
  return runs.reduce((current, run) => {
    const runTime = run.completed_at || run.started_at;
    const currentTime = current.completed_at || current.started_at;

    return !runTime || !currentTime || runTime > currentTime ? run : current;
  });
}
