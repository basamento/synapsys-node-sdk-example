'use strict';

const path = require('path');
const { Worker } = require('worker_threads');
const log = require('../logger').forProcess('checksum-cruncher');

/**
 * CPU-bound work done the right way on Node.
 *
 * Node has one event loop. A tight numeric loop on the main thread blocks
 * everything sharing it — including the Synapsys heartbeat, which then stops
 * reaching Core and makes the whole worker look dead. Moving the work to a
 * worker_thread keeps the main thread free, and gives real cancellation as a
 * bonus: `worker.terminate()` stops the thread outright, with none of the
 * cooperation an AbortSignal needs.
 *
 * Compare with event-loop-hog.js, which does the same arithmetic the naive way.
 */
function crunch(rounds, signal) {
  return new Promise(function (resolve, reject) {
    const worker = new Worker(
      path.join(__dirname, '..', 'workers', 'checksum.worker.js'),
      { workerData: { rounds: rounds } }
    );

    let settled = false;

    function onAbort() {
      if (settled) return;
      log.info('stop received — terminating the worker thread');
      // Real preemption. The thread dies mid-loop; no cooperation required.
      worker.terminate();
      const error = new Error('checksum cancelled');
      error.name = 'AbortError';
      settled = true;
      reject(error);
    }

    if (signal) {
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    worker.on('message', function (message) {
      if (message.type === 'progress') {
        log.info('  round ' + message.round + '/' + message.of +
          ' done — main thread never blocked, heartbeats kept flowing');
      } else if (message.type === 'done') {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener('abort', onAbort);
        log.info('checksum complete: ' + message.checksum);
        resolve(message.checksum);
      }
    });

    worker.on('error', function (error) {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(error);
    });

    worker.on('exit', function (code) {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener('abort', onAbort);
      if (code !== 0) reject(new Error('checksum worker exited with code ' + code));
    });
  });
}

module.exports = { crunch };
