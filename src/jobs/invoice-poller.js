'use strict';

/**
 * Ordinary business logic. Nothing in this file knows Synapsys exists — no import,
 * no base class, no decorator. That is the point: adopting the SDK means editing
 * the entry point, not the code that does the work.
 */

const log = require('../logger').forProcess('invoice-poller');

let polled = 0;

/** One poll. In a real application this would hit a database or a queue. */
async function pollInvoices() {
  polled++;
  const found = Math.floor(Math.random() * 4);

  // Printed to stdout, so it is streamed to Core and shown against this run.
  log.info('poll #' + polled + ' — found ' + found + ' new invoice(s)');

  for (let i = 0; i < found; i++) {
    log.info('  processing invoice INV-' + (1000 + polled * 10 + i));
  }
  return found;
}

function totalPolls() {
  return polled;
}

module.exports = { pollInvoices, totalPolls };
