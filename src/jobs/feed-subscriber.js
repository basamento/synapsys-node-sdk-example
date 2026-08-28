'use strict';

const http = require('http');
const log = require('../logger').forProcess('feed-subscriber');

/**
 * A deliberately slow HTTP request, so a stop arriving mid-flight is visible.
 *
 * The AbortSignal is an ordinary parameter. The job does not know it came from
 * Synapsys — anything that can produce a signal (a test, a CLI flag, a parent
 * request) can drive this function.
 */
function fetchFeed(url, signal) {
  return new Promise(function (resolve, reject) {
    const request = http.get(url, { signal: signal }, function (response) {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', function (chunk) { body += chunk; });
      response.on('end', function () { resolve(body); });
      response.on('error', reject);
    });
    request.on('error', reject);
  });
}

/**
 * Requests the example's own /slow endpoint, which takes 10 seconds to answer.
 *
 * Press Stop in the Core console while this is waiting: the request aborts
 * immediately instead of holding the process in `stopping` for the remaining time.
 * That is the difference `stop.signal` makes.
 */
async function subscribeOnce(baseUrl, signal) {
  log.info('requesting ' + baseUrl + '/slow (takes ~10s)');
  const startedAt = Date.now();
  try {
    const body = await fetchFeed(baseUrl + '/slow', signal);
    log.info('feed received after ' + (Date.now() - startedAt) + 'ms: ' + body.trim());
    return body;
  } catch (error) {
    // An abort surfaces here as an AbortError. Rethrowing is correct: the SDK
    // recognises it as a stop rather than a failure, because a stop is outstanding.
    if (error && (error.name === 'AbortError' || error.code === 'ABORT_ERR')) {
      log.info('request aborted after ' + (Date.now() - startedAt) + 'ms — stop honoured mid-flight');
    }
    throw error;
  }
}

module.exports = { subscribeOnce, fetchFeed };
