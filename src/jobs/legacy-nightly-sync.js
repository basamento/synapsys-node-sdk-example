'use strict';

/**
 * Written in 2011. Never touched since. Still works.
 *
 * No async, no promises, no Synapsys. It is registered by reference in the entry
 * point and runs unchanged — which is the whole adoption argument. The only thing
 * it gained is that someone can now start and stop it from a browser.
 */

var log = require('../logger').forProcess('legacy-nightly-sync');
var recordsSynced = 0;

function syncBatch(callback) {
  var batch = Math.floor(Math.random() * 20) + 5;
  recordsSynced += batch;
  log.info('synced ' + batch + ' records (' + recordsSynced + ' total)');
  // Old-style callback, on purpose.
  setTimeout(function () { callback(null, batch); }, 200);
}

function total() {
  return recordsSynced;
}

module.exports = { syncBatch: syncBatch, total: total };
