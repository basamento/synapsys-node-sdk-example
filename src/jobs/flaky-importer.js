'use strict';

const log = require('../logger').forProcess('flaky-importer');

let attempts = 0;

/**
 * Throws on purpose, to show what a failure looks like from Core.
 *
 * The process lands in `failed`, the stack trace is captured as stderr and shown
 * against the run in the Core console, and the exception never reaches this
 * application's own error handling. Starting it again from Core clears the state:
 * `failed` is a legal starting point.
 */
async function importFromUpstream() {
  attempts++;
  log.info('attempt ' + attempts + ': connecting to upstream');
  log.info('  (this process fails deliberately — every third attempt succeeds)');

  await new Promise(function (resolve) { setTimeout(resolve, 600); });

  // Every third attempt succeeds, so the process can be seen recovering.
  if (attempts % 3 !== 0) {
    log.info('attempt ' + attempts + ': upstream rejected the batch');
    log.info('  throwing on purpose now — expect a [Synapsys] ERROR and state=failed');
    const error = new Error(
      'DELIBERATE FAILURE (this is the example working): upstream returned 502 for batch ' +
      attempts
    );
    error.code = 'EUPSTREAM';
    throw error;
  }

  log.info('attempt ' + attempts + ': batch accepted — the process returns to idle');
  return attempts;
}

function attemptCount() {
  return attempts;
}

module.exports = { importFromUpstream, attemptCount };
