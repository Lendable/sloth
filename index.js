const core = require('@actions/core');
const github = require('@actions/github');

async function delay(secs) {
  return new Promise((resolve) => setTimeout(resolve, secs * 1000));
}

const startTime = new Date();

const inputs = {
  name: core.getInput('name'),
  interval: core.getInput('interval'),
  timeout: core.getInput('timeout'),
  ref: core.getInput('ref'),
  ignored: new Set(core.getMultilineInput('ignored')),
};

const octokit = github.getOctokit(core.getInput('token', { required: true }));

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
};
if (inputs.ignored.size > 0) {
  console.info('::group::Ignored check names');
  console.info([...inputs.ignored]);
  console.info('::endgroup::');
}

const run = async () => {
  while (true) {
    let checks = [];

    console.info('');

    const iterator = octokit.paginate.iterator(
      octokit.rest.checks.listForRef,
      {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        ref: inputs.ref,
        per_page: 100,
      },
    );

    for await (const checkRun of iterator) {
      checks = checks.concat(checkRun.data);
    }

    checks = checks.filter((v) => v.name !== inputs.name && !inputs.ignored.has(v.name));

    core.debug(`Found a total of ${checks.length} relevant check runs`);

    if (checks.length === 0) {
      console.info(`Slothing, verifying again in ${inputs.interval}s...`);
      await delay(inputs.interval);
      continue;
    }

    const pending = [];
    const failures = [];
    const successful = [];

    checks.forEach((check) => {
      if (!check.conclusion) {
        pending.push(check.name);
      } else if (['failure', 'cancelled'].includes(check.conclusion)) {
        failures.push(check.name);
      } else {
        successful.push(check.name);
      }
    });

    [successful, failures, pending].forEach((list) => list.sort());

    if (successful.length > 0) {
      console.info(`::group::✅ ${colors.green}${successful.length}${colors.reset}`);
      successful.forEach((v) => console.info(v));
      console.info('::endgroup::');
    }

    if (failures.length > 0) {
      console.info(`::group::❌ ${colors.red}${failures.length}${colors.reset}`);
      failures.forEach((v) => console.info(v));
      console.info('::endgroup::');
    }

    if (pending.length > 0) {
      console.info(`::group::⏳ ${pending.length}`);
      pending.forEach((v) => console.info(v));
      console.info('::endgroup::');
    }

    if (failures.length > 0) {
      console.info('');
      console.info(`❗ ${colors.red}Failure!${colors.reset}`);
      core.setFailed('A check run failed.');
      return;
    }

    if (pending.length === 0) {
      console.info('');
      console.info(`🚀 ${colors.green}Success!${colors.reset}`);
      return;
    }

    if (Math.round((new Date() - startTime) / 1000) > inputs.timeout) {
      console.info('');
      console.info(`⏰ ${colors.red}Timed out!${colors.reset}`);
      core.setFailed('Timed out waiting on check runs to all be successful.');
      return;
    }

    console.info(`Slothing, verifying again in ${inputs.interval}s...`);
    await delay(inputs.interval);
  }
};

run();
