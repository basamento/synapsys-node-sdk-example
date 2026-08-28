'use strict';

/**
 * Adoption inside an existing Express application.
 *
 * This is the case the SDK is designed around: an app that already exists, already
 * serves traffic, and already has business logic in files nobody wants to reopen.
 * Everything Synapsys-related is in this file. The routes, the middleware and the
 * job modules are untouched, and deleting the four marked blocks leaves a working
 * Express app.
 *
 * Run with:  npm run start:express
 */

// Loads .env if present, before anything reads process.env. Optional: settings
// can come from the shell instead.
require('./src/load-env').loadEnv();

const express = require('express');

// ---- Synapsys: 1 of 4 — the import ---------------------------------------
const { Synapsys } = require('@synapsys-io/sdk');
// --------------------------------------------------------------------------

const { app: log } = require('./src/logger');
const invoicePoller = require('./src/jobs/invoice-poller');
const cacheWarmer = require('./src/jobs/cache-warmer');
const { importFromUpstream } = require('./src/jobs/flaky-importer');

const PORT = Number(process.env.PORT || 3002);
const server = express();

// An ordinary Express application, written before Synapsys existed.
server.get('/', function (request, response) {
  response.type('text/plain').send(
    'The application itself is unaffected.\n' +
    'Its own routes keep serving while processes run.\n\n' +
    'Try /invoices, or /synapsys for process state.\n'
  );
});

server.get('/invoices', function (request, response) {
  response.json({ polls: invoicePoller.totalPolls() });
});

// ---- Synapsys: 2 of 4 — create the worker --------------------------------
const synapsys = new Synapsys({
  workerName: process.env.SYNAPSYS_WORKER_NAME || 'node-example-express',
  heartbeatInterval: '5s'
});
// --------------------------------------------------------------------------

// ---- Synapsys: 3 of 4 — register existing functions ----------------------
synapsys.endless('invoice-poller', async function (stop) {
  while (!stop.requested) {
    await invoicePoller.pollInvoices();
    await stop.sleep('5s');
  }
});

synapsys.endless('cache-warmer', async function (stop) {
  while (!stop.requested) {
    await cacheWarmer.warmOne();
    await stop.sleep('2s');
  }
}, { onStop: cacheWarmer.closeCache });

synapsys.progressive('flaky-importer', importFromUpstream);
// --------------------------------------------------------------------------

// A route exposing what the SDK reports, so the effect of a Core command is
// visible without leaving the app.
server.get('/synapsys', function (request, response) {
  response.json({
    worker: synapsys.config.workerName,
    processes: synapsys.processes.map(function (p) {
      return {
        name: p.name, type: p.type, state: p.currentState,
        ackToken: p.ackToken, runId: p.runId
      };
    })
  });
});

const listener = server.listen(PORT, function () {
  log('express example on http://localhost:' + PORT);

  // ---- Synapsys: 4 of 4 — start -----------------------------------------
  // Started after the server is listening, so the app is serving traffic before
  // any process can be commanded. Not awaited: a Core that is down must never
  // stop this application from booting.
  synapsys.start();
  // ------------------------------------------------------------------------
});

process.on('SIGINT', async function () {
  log('received SIGINT — shutting down');
  await synapsys.stop();
  listener.close(function () { process.exit(0); });
  setTimeout(function () { process.exit(0); }, 3000).unref();
});
