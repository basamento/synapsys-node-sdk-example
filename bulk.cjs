'use strict';

/**
 * Scale fixture: many processes on one worker, for exercising Core.
 *
 * The Spring examples ship a hundred hand-written classes of each type, because
 * that is what component scanning requires. Registration here is explicit, so the
 * same load is a loop — and the count is a runtime setting rather than a number
 * baked into the source.
 *
 *   npm run start:bulk
 *   EXAMPLE_ENDLESS=250 EXAMPLE_PROGRESSIVE=250 npm run start:bulk
 *
 * Every process is deliberately cheap: a counter, a log line, and a sleep. The
 * intent is to load Core's heartbeat and console ingestion, not this machine.
 *
 * Note what stays constant as the count grows. One HTTP request per interval
 * carries every process, so the heartbeat payload grows but the request count does
 * not. If Core starts lagging, the payload size and the log volume are the things
 * to look at, not the number of connections.
 */

// Loads .env if present, before anything reads process.env. Optional: settings
// can come from the shell instead.
require('./src/load-env').loadEnv();

const { Synapsys } = require('@synapsys-io/sdk');
const { app } = require('./src/logger');
const { createStatusServer, listen } = require('./src/status-server');

const ENDLESS_COUNT = Number(process.env.EXAMPLE_ENDLESS || 100);
const PROGRESSIVE_COUNT = Number(process.env.EXAMPLE_PROGRESSIVE || 100);
const PORT = Number(process.env.PORT || 3003);

// How chatty each process is. Console capture is the part of the pipeline most
// likely to strain first, so it is worth being able to turn the volume down.
const QUIET = process.env.EXAMPLE_QUIET === 'true';

const synapsys = new Synapsys({
  workerName: process.env.SYNAPSYS_WORKER_NAME || 'node-example-bulk',
  heartbeatInterval: process.env.SYNAPSYS_HEARTBEAT_INTERVAL || '5s'
});

const ticks = Object.create(null);

for (let i = 1; i <= ENDLESS_COUNT; i++) {
  const name = 'bulk-endless-' + i;
  ticks[name] = 0;

  synapsys.endless(name, async function (stop) {
    if (!QUIET) console.log(name + ': started');
    while (!stop.requested) {
      ticks[name]++;
      if (!QUIET) console.log(name + ': tick ' + ticks[name]);
      await stop.sleep('1s');
    }
    if (!QUIET) console.log(name + ': stopped after ' + ticks[name] + ' tick(s)');
  });
}

for (let i = 1; i <= PROGRESSIVE_COUNT; i++) {
  const name = 'bulk-progressive-' + i;
  ticks[name] = 0;

  synapsys.progressive(name, async function (ctx) {
    const steps = 30;
    if (!QUIET) console.log(name + ': run started, ' + steps + ' steps');
    for (let step = 1; step <= steps; step++) {
      ctx.throwIfCancelled();
      ticks[name]++;
      // Awaiting yields the event loop, which is what lets hundreds of these
      // interleave without any of them blocking the heartbeat.
      await ctx.sleep('1s');
      if (!QUIET) console.log(name + ': step ' + step + '/' + steps);
    }
    if (!QUIET) console.log(name + ': run complete');
  });
}

async function main() {
  const server = createStatusServer(synapsys, function () {
    let running = 0;
    let failed = 0;
    for (const process of synapsys.processes) {
      if (process.currentState === 'running') running++;
      if (process.currentState === 'failed') failed++;
    }
    return {
      registered: synapsys.processes.length,
      running: running,
      failed: failed,
      totalTicks: Object.keys(ticks).reduce(function (sum, k) { return sum + ticks[k]; }, 0)
    };
  });
  await listen(server, PORT);

  await synapsys.start();
  app('bulk fixture: ' + ENDLESS_COUNT + ' endless + ' + PROGRESSIVE_COUNT +
    ' progressive = ' + synapsys.processes.length + ' processes on one worker');
  app('all of them ride a single heartbeat every ' +
    (synapsys.config.heartbeatInterval / 1000) + 's');
  if (QUIET) app('EXAMPLE_QUIET=true — processes will not print, so nothing is captured');

  async function shutdown(signal) {
    app('received ' + signal + ' — shutting down');
    await synapsys.stop();
    server.close(function () { process.exit(0); });
    setTimeout(function () { process.exit(0); }, 5000).unref();
  }
  process.on('SIGINT', function () { shutdown('SIGINT'); });
  process.on('SIGTERM', function () { shutdown('SIGTERM'); });
}

main().catch(function (error) {
  console.error('failed to start:', error);
  process.exit(1);
});
