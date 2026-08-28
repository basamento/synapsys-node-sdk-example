'use strict';

const log = require('../logger').forProcess('slow-migration');

/**
 * Deliberately long, so there is always time to stop it from Core mid-run.
 *
 * Sleeping through `sleep` — the SDK's `stop.sleep` is passed in — is what lets a
 * stop take effect immediately. With a bare setTimeout the process would sit in
 * `stopping` for up to a full step.
 */
async function migrate(steps, sleep, checkCancelled) {
  log.info('migration starting: ' + steps + ' steps, ~3s each');

  for (let step = 1; step <= steps; step++) {
    checkCancelled();
    log.info('  step ' + step + '/' + steps + ' — migrating table batch ' + step);

    const completed = await sleep('3s');
    if (!completed) {
      // sleep() resolves false when a stop cut it short.
      log.info('  step ' + step + ' interrupted by a stop command');
      checkCancelled();
    }
  }

  log.info('migration complete');
  return steps;
}

module.exports = { migrate };
