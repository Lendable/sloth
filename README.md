<p align="center">
  <img src="https://repository-images.githubusercontent.com/792217316/5803d818-239e-4aa0-a7fe-11df954778c0" alt="Sloth" width="400">
</p>
<h1 align="center">🦥 Sloth 🦥</h1>

Sloth is a GitHub Action designed to optimize and streamline continuous integration suites by acting as the final arbiter for their success. 
It patiently waits for all other checks to conclude, providing its seal of approval only if all triggered jobs were successful. 
Sloth bridges a functionality gap within GitHub Actions, allowing for required checks to be dynamic, a feature not natively supported.

## When to Use Sloth

Sloth is invaluable in the following scenarios:

* **Conditional Triggers with Mandatory Success**: Sloth is invaluable when you need to trigger a check conditionally, but mandate its success if triggered. For instance:
  * Linting GitHub Action workflows selectively when they are modified.
  * Running checks only for services modified within a monorepo.
* **Large Matrix of Checks**: Sloth simplifies the management of extensive check matrices, alleviating the burden of maintaining which checks are required.

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

jobs:
  sloth:
    runs-on: ubuntu-22.04
    steps:
      - name: Sloth
        uses: lendable/sloth@v0
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Name       | Description                                                                                                                            | Required | Default                                                     |
|------------|----------------------------------------------------------------------------------------------------------------------------------------|----------|-------------------------------------------------------------|
| `token`    | GitHub token to use to interact with the GitHub API, unless you have rate limit concerns this should be `${{ secrets.GITHUB_TOKEN }}`. | Yes      |                                                             |
| `ref`      | Git reference to inspect check runs for. The default supports Pull Requests, Merge Queues as well as branch pushes.                    | No       | `${{ github.event.pull_request.head.sha \|\| github.sha }}` |
| `interval` | The number of seconds in between polls of the GitHub API for check run conclusions.                                                    | No       | `10`                                                        |
| `timeout`  | The number of seconds before the job is declared a failure if check runs have not yet concluded.                                       | No       | `600`                                                       |
| `name`     | The name of Sloth's own check run. This is used to ensure Sloth does not wait upon itself.                                             | No       | `"sloth"`                                                   |
| `ignored`  | A multi-line list of check run names to ignore when determining an overall result.                                                     | No       | `""`                                                        |
