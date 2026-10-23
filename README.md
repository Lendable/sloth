<p align="center">
  <img src="https://repository-images.githubusercontent.com/792217316/5803d818-239e-4aa0-a7fe-11df954778c0" alt="Sloth" width="400">
</p>
<h1 align="center">🦥 Sloth 🦥</h1>

Sloth is a GitHub Action designed to optimize and streamline continuous integration suites by acting as the final arbiter for their success.
It patiently waits for all other checks to conclude, providing its seal of approval only if all triggered jobs were successful.
Sloth bridges a functionality gap within GitHub Actions, allowing for required checks to be dynamic, a feature not natively supported.

## When to Use Sloth

Sloth is invaluable in the following scenarios:

- **Conditional Triggers with Mandatory Success**: Sloth is invaluable when you need to trigger a check conditionally, but mandate its success if triggered. For instance:
  - Linting GitHub Action workflows selectively when they are modified.
  - Running checks only for services modified within a monorepo.
- **Large Matrix of Checks**: Sloth simplifies the management of extensive check matrices, alleviating the burden of maintaining which checks are required.

## Configuration

To integrate Sloth, follow these steps:

1. **Create Workflow**: Sloth runs as a separate workflow. See the example definition below for a copyable workflow file.
2. **Set as Required Check**: Configure Sloth as the primary (often sole) required check in your branch protection rules. This ensures that the entire suite is contingent upon Sloth's validation.

## Example Workflow

```yaml
name: Sloth

on:
  pull_request:
  merge_group:

permissions:
  contents: read
  checks: read
  actions: read

jobs:
  sloth:
    runs-on: ubuntu-24.04
    steps:
      - name: Sloth
        uses: lendable/sloth@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Name       | Description                                                                                                                            | Required | Default                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| `token`    | GitHub token to use to interact with the GitHub API, unless you have rate limit concerns this should be `${{ secrets.GITHUB_TOKEN }}`. | Yes      |                                                             |
| `ref`      | Git reference to inspect check runs for. The default supports Pull Requests, Merge Queues as well as branch pushes.                    | No       | `${{ github.event.pull_request.head.sha \|\| github.sha }}` |
| `interval` | The number of seconds in between polls of the GitHub API for check run conclusions.                                                    | No       | `10`                                                        |
| `timeout`  | The number of seconds before the job is declared a failure if check runs have not yet concluded.                                       | No       | `600`                                                       |
| `name`     | The name of Sloth's own check run. This is used to ensure Sloth does not wait upon itself.                                             | No       | `"sloth"`                                                   |
| `ignored`  | A multi-line list of check run names or glob patterns to ignore when determining an overall result. Supports `*` wildcard.             | No       | `""`                                                        |
| `allow-empty` | When `true`, Sloth succeeds if no check runs appear after the settle period. Useful when path-filtered workflows may not trigger.    | No       | `"false"`                                                   |
| `empty-settle-time` | Seconds to wait before accepting an empty result when `allow-empty` is true. Ensures workflows have time to be scheduled.      | No       | `30`                                                        |

## Ignoring Checks

The `ignored` input accepts both exact check run names and glob patterns using the `*` wildcard. Each line is treated as a separate entry.

**Exact match** — ignores a check with that precise name:

```yaml
ignored: |
  some-optional-check
```

**Wildcard patterns** — `*` matches any sequence of characters:

```yaml
ignored: |
  deploy-*-staging
  e2e / * / smoke-test
```

This is particularly useful for dynamic matrix jobs where check run names are generated at runtime and cannot be enumerated upfront. For example, skipping optional deployment or smoke-test checks from a dynamic CI matrix while still gating on the required checks.

## Allow Empty

When Sloth runs alongside path-filtered workflows, some PRs may not trigger any other checks (e.g. documentation-only changes). By default, Sloth waits for at least one check to appear and will eventually time out if none do.

Set `allow-empty: "true"` to let Sloth succeed when no other checks are found. To avoid a race condition where Sloth passes before other workflows have had time to be scheduled, Sloth waits for `empty-settle-time` seconds (default 30) before accepting an empty result. If any check appears during the settle period, Sloth resumes normal behaviour and waits for it to conclude.

```yaml
- name: Sloth
  uses: lendable/sloth@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    allow-empty: "true"
    empty-settle-time: "30"
```

## Cancelled Check Runs

A cancelled check run normally fails Sloth. But a workflow run can be cancelled because a newer run of the same workflow replaced it on the same commit, for example by a `concurrency` group with `cancel-in-progress`. Its check runs stay on the commit, and the newer run only creates check runs for jobs behind `needs:` once the jobs they need have finished. Until then, the cancelled check run is the most recent one with its name.

So when the most recent check run with a name was cancelled by GitHub Actions, and a newer run (or a newer attempt) of the same workflow exists on the same commit:

- Sloth goes through the newer runs newest first. The first one with its own check run with that name provides the result, even if it finished before the cancellation and whatever that run's overall result.
- A newer run without its own check run is only passed over once it has concluded and Sloth has read the check runs again since, so it can't miss one the run created just before concluding. Until then, Sloth waits for it and lists the check under 🔁 instead of failing. If that run is re-run, Sloth waits for the new attempt in the same way.
- If none of the newer runs has its own check run with that name, the newest one decides. If it succeeded, the check is listed under ⏭️ and counts like a skipped one. If it didn't succeed (for example, it was cancelled itself before running any job), the cancelled check run stands and fails Sloth.

This applies whatever cancelled the older run, including a manual cancellation. A cancelled check run with no newer run of its workflow on the commit still fails Sloth immediately.

This needs the `actions: read` permission, as in the example workflow above. Without it, Sloth logs a warning and counts every cancelled check run as a failure, as before.
