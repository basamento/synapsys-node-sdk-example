/**
 * The same wiring in ESM.
 *
 * Nothing about the SDK changes between module systems — the package ships both
 * entry points and they resolve to one module instance, so there is no duplicated
 * state. The only differences here are `import` and top-level `await`.
 *
 * Run with:  npm run start:esm
 *
 * A representative subset; see app.cjs for one process of every kind.
 */

import { Synapsys } from '@synapsys-io/sdk';
import { createRequire } from 'module';

// The job files are CommonJS, and ESM imports them unchanged — which is the usual
// situation in a codebase that has been migrating for a few years.
const require = createRequire(import.meta.url);
const { app } = require('./src/logger');
const { createStatusServer, listen } = require('./src/status-server');
const invoicePoller = require('./src/jobs/invoice-poller');
const { buildMonthlyReport } = require('./src/jobs/report-builder');
const { importRows } = require('./src/jobs/bulk-import');

const PORT = Number(process.env.PORT || 3001);

const synapsys = new Synapsys({
  workerName: process.env.SYNAPSYS_WORKER_NAME || 'node-example-esm',
  heartbeatInterval: '5s'
});

synapsys.endless('invoice-poller', async (stop) => {
  while (!stop.requested) {
    await invoicePoller.pollInvoices();
    await stop.sleep('5s');
  }
});

synapsys.progressive('monthly-report', buildMonthlyReport);

synapsys.progressive('bulk-import', async (ctx) => {
  await importRows(40, () => ctx.throwIfCancelled());
});

const server = createStatusServer(synapsys, () => ({
  invoicePolls: invoicePoller.totalPolls()
}));
await listen(server, PORT);

// Top-level await, so a failFast rejection would stop the module from loading.
await synapsys.start();
app('ESM example ready on http://localhost:' + PORT);

const shutdown = async (signal) => {
  app('received ' + signal + ' — shutting down');
  await synapsys.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
