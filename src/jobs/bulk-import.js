'use strict';

const log = require('../logger').forProcess('bulk-import');

/**
 * A long job over many items, cancellable between them.
 *
 * `checkCancelled` is passed in rather than imported, so this function has no
 * dependency on Synapsys and can be driven by a test with a no-op.
 */
async function importRows(rowCount, checkCancelled) {
  log.info('importing ' + rowCount + ' rows');

  for (let row = 1; row <= rowCount; row++) {
    // The cancellation point. Without one, a stop cannot take effect until the
    // loop finishes on its own.
    checkCancelled();

    await new Promise(function (resolve) { setTimeout(resolve, 250); });

    if (row % 5 === 0 || row === rowCount) {
      log.info('  imported ' + row + '/' + rowCount + ' rows');
    }
  }

  log.info('import finished — all ' + rowCount + ' rows');
  return rowCount;
}

module.exports = { importRows };
