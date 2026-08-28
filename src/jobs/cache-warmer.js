'use strict';

const log = require('../logger').forProcess('cache-warmer');

/**
 * Holds a resource that must be released when the process stops — the case `onStop`
 * exists for. Here it is just a Map and an interval, but the shape is the same for a
 * database pool, a socket, or a file handle.
 */
let cache = null;
let warmed = 0;

function openCache() {
  cache = new Map();
  log.info('cache opened');
}

async function warmOne() {
  if (cache === null) openCache();
  warmed++;
  const key = 'product:' + (warmed % 50);
  cache.set(key, { warmedAt: Date.now() });
  log.info('warmed ' + key + ' (' + cache.size + ' entries held)');
}

/** Called from onStop. Runs even when the process was stopped mid-loop. */
function closeCache() {
  if (cache === null) {
    log.info('cache already closed');
    return;
  }
  const held = cache.size;
  cache.clear();
  cache = null;
  log.info('cache closed, released ' + held + ' entries');
}

function size() {
  return cache === null ? 0 : cache.size;
}

module.exports = { warmOne, closeCache, size };
