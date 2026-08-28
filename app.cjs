'use strict';

/**
 * The main example: a CommonJS application registering one process of every kind.
 *
 * This is the file to read first. app.mjs and express-app.cjs are the same wiring
 * in different idioms, with a smaller subset.
 *
 * Run it with:   npm start
 * Then open:     http://localhost:3000
 * And drive it from the Core console.
 */

const { Synapsys } = require('@synapsys-io/sdk');

const { app } = require('./src/logger');
const { createStatusServer, listen } = require('./src/status-server');

// Ordinary business logic. None of these files import Synapsys.
const invoicePoller = require('./src/jobs/invoice-poller');
const feedSubscriber = require('./src/jobs/feed-subscriber');
const cacheWarmer = require('./src/jobs/cache-warmer');
const legacySync = require('./src/jobs/legacy-nightly-sync');
const { buildMonthlyReport } = require('./src/jobs/report-builder');
const { importRows } = require('./src/jobs/bulk-import');
const { importFromUpstream } = require('./src/jobs/flaky-importer');
const { migrate } = require('./src/jobs/slow-migration');
const { crunch } = require('./src/jobs/checksum-cruncher');
const { hogTheLoop } = require('./src/jobs/event-loop-hog');

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = 'http://127.0.0.1:' + PORT;

// ---------------------------------------------------------------------------
// 1. Create the worker.
//
// coreUrl and coreToken come from SYNAPSYS_CORE_URL and SYNAPSYS_CORE_TOKEN. Every
// setting can be given here instead; the options object wins over the environment.
// ---------------------------------------------------------------------------

const synapsys = new Synapsys({
  workerName: process.env.SYNAPSYS_WORKER_NAME || 'node-example',
  heartbeatInterval: '5s'
});

// ---------------------------------------------------------------------------
// 2. Register processes. Any function reference works.
// ---------------------------------------------------------------------------

/*
 * ENDLESS — runs until Core says stop.
 *
 * The canonical shape. Poll `stop.requested`, and wait with `stop.sleep` rather
 * than a bare timer so a stop takes effect immediately instead of after the delay.
 */
synapsys.endless('invoice-poller', async function (stop) {
  while (!stop.requested) {
    await invoicePoller.pollInvoices();
    await stop.sleep('5s');
  }
});

/*
 * ENDLESS — with in-flight I/O cancellation.
 *
 * `stop.signal` is a real AbortSignal. Handing it to the request means a stop
 * aborts it mid-flight, rather than leaving the process in `stopping` until the
 * slow endpoint answers. Stop this one while it is waiting and watch the timing.
 */
synapsys.endless('feed-subscriber', async function (stop) {
  while (!stop.requested) {
    await feedSubscriber.subscribeOnce(BASE_URL, stop.signal);
    await stop.sleep('3s');
  }
});

/*
 * ENDLESS — with cleanup.
 *
 * onStop runs after a stop is commanded, whether the body was mid-work or asleep.
 * A throw inside it is logged and does not abort the stop.
 */
synapsys.endless('cache-warmer', async function (stop) {
  while (!stop.requested) {
    await cacheWarmer.warmOne();
    await stop.sleep('2s');
  }
}, {
  onStop: function () { cacheWarmer.closeCache(); }
});

/*
 * ENDLESS — a fifteen-year-old callback-style function, adopted by reference.
 *
 * src/jobs/legacy-nightly-sync.js was not modified to make this work. It has no
 * Synapsys import, no base class, and no idea it is being managed.
 */
synapsys.endless('legacy-nightly-sync', async function (stop) {
  while (!stop.requested) {
    await new Promise(function (resolve, reject) {
      legacySync.syncBatch(function (err) { err ? reject(err) : resolve(); });
    });
    await stop.sleep('4s');
  }
});

/*
 * PROGRESSIVE — runs to completion.
 *
 * Start it from Core; it finishes on its own and returns itself to `idle`. No stop
 * command is involved. Passing an existing function directly is the whole
 * registration.
 */
synapsys.progressive('monthly-report', buildMonthlyReport);

/*
 * PROGRESSIVE — cancellable between items.
 *
 * `ctx.throwIfCancelled()` is the cancellation point. Stop it mid-run and it
 * returns to `idle` rather than `failed`: a stop is not a failure.
 */
synapsys.progressive('bulk-import', async function (ctx) {
  await importRows(40, function () { ctx.throwIfCancelled(); });
});

/*
 * PROGRESSIVE — long enough to always catch it mid-run.
 *
 * Uses stop.sleep between steps, so a stop lands within milliseconds rather than
 * at the end of the current three-second step.
 */
synapsys.progressive('slow-migration', async function (ctx) {
  await migrate(
    20,
    function (duration) { return ctx.sleep(duration); },
    function () { ctx.throwIfCancelled(); }
  );
});

/*
 * PROGRESSIVE — fails on purpose.
 *
 * Ends in `failed`, and the stack trace is streamed to Core as stderr and shown
 * against the run. Nothing reaches this application's own error handling. Start it
 * again to clear the state — every third attempt succeeds.
 */
synapsys.progressive('flaky-importer', importFromUpstream);

/*
 * PROGRESSIVE — CPU-bound, done correctly.
 *
 * The arithmetic runs on a worker_thread, so the event loop stays free and
 * heartbeats keep flowing while it works. Stopping it terminates the thread
 * outright, which is real preemption rather than cooperation.
 */
synapsys.progressive('checksum-cruncher', async function (ctx) {
  await crunch(30, ctx.signal);
});

/*
 * PROGRESSIVE — CPU-bound, done WRONG. Opt-in.
 *
 * Set EXAMPLE_ENABLE_HOG=true to register it. While it runs, the heartbeat stops,
 * every other process freezes, the status page stops answering, and Core marks the
 * worker stale. Stop does nothing until it finishes. Read the comments in
 * src/jobs/event-loop-hog.js before running it — it is here to be understood, not
 * copied.
 */
if (process.env.EXAMPLE_ENABLE_HOG === 'true') {
  app('EXAMPLE_ENABLE_HOG is set — registering the blocking process');
  synapsys.progressive('event-loop-hog', async function (ctx) {
    await hogTheLoop(3, function () { ctx.throwIfCancelled(); });
  });
}

// ---------------------------------------------------------------------------
// 3. Start. One call, because plain Node has no lifecycle to hook.
// ---------------------------------------------------------------------------

async function main() {
  const server = createStatusServer(synapsys, function () {
    return {
      invoicePolls: invoicePoller.totalPolls(),
      cacheEntriesHeld: cacheWarmer.size(),
      legacyRecordsSynced: legacySync.total()
    };
  });
  await listen(server, PORT);

  // Not awaiting is fine. Awaiting matters only with failFast, which reports an
  // unreachable Core by rejecting.
  await synapsys.start();

  app('registered ' + synapsys.processes.length + ' process(es) — all idle until Core says otherwise');
  app('open ' + BASE_URL + ' and drive them from the Core console');

  // The SDK installs no signal handlers of its own, because that would change how
  // the host application behaves. Wire shutdown yourself.
  async function shutdown(signal) {
    app('received ' + signal + ' — shutting down');
    await synapsys.stop();
    server.close(function () { process.exit(0); });
    setTimeout(function () { process.exit(0); }, 3000).unref();
  }
  process.on('SIGINT', function () { shutdown('SIGINT'); });
  process.on('SIGTERM', function () { shutdown('SIGTERM'); });
}

main().catch(function (error) {
  console.error('failed to start:', error);
  process.exit(1);
});
