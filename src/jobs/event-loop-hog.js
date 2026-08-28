'use strict';

const log = require('../logger').forProcess('event-loop-hog');

/**
 * CPU-bound work done the WRONG way, on purpose.
 *
 * This is the direct translation of what a thread-per-process runtime lets you get
 * away with, and it is the single most common mistake a Java or Go developer makes
 * on their first Node process. It is opt-in — set EXAMPLE_ENABLE_HOG=true — because
 * running it degrades the whole worker.
 *
 * What you will see while it runs:
 *
 *   - Heartbeats stop. Nothing reaches Core for as long as the loop runs, because
 *     the timer that sends them cannot fire.
 *   - Every other process freezes too. Their timers are on the same event loop.
 *   - The status page stops responding.
 *   - Core eventually shows this worker as stale, and the Start/Stop buttons for
 *     every one of its processes go dead.
 *   - Stop does nothing until the loop finishes. `checkCancelled()` is called
 *     often, but the abort that would set it can never be delivered, because
 *     delivering it needs the event loop this function is monopolising.
 *
 * That last point is the one worth sitting with. On the JVM, Thread.interrupt()
 * reaches a thread spinning in a loop. On Node there is nothing to interrupt with:
 * cancellation is a message, and messages are delivered by the loop you are
 * blocking. Use worker_threads — see checksum-cruncher.js.
 */
async function hogTheLoop(rounds, checkCancelled) {
  log.error('WARNING: blocking the event loop on purpose for ~' + rounds + ' rounds');
  log.error('heartbeats, other processes and the status page are all frozen until this returns');

  let sink = 0;
  for (let round = 1; round <= rounds; round++) {
    // Called, but it can never observe a stop: the abort is queued behind this
    // loop and cannot be delivered while the loop is running.
    checkCancelled();

    for (let i = 0; i < 200000000; i++) {
      sink += Math.sqrt(i) * Math.sin(i);
    }

    // This line is buffered and only reaches Core once the loop finally yields.
    log.error('  round ' + round + '/' + rounds + ' — still blocking');
  }

  log.info('event loop released, checksum ' + Math.round(sink));
  log.info('heartbeats resume now; Core will show this worker recovering');
  return Math.round(sink);
}

module.exports = { hogTheLoop };
