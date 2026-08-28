'use strict';

const log = require('../logger').forProcess('monthly-report');

const SECTIONS = [
  'revenue', 'refunds', 'taxes', 'payroll', 'depreciation', 'summary'
];

/**
 * Runs to completion and returns. A progressive process reaches `idle` by
 * finishing — nothing has to set the state, and no stop command is involved.
 */
async function buildMonthlyReport() {
  log.info('building report for ' + new Date().toISOString().slice(0, 7));

  for (let i = 0; i < SECTIONS.length; i++) {
    await new Promise(function (resolve) { setTimeout(resolve, 800); });
    log.info('  section ' + (i + 1) + '/' + SECTIONS.length + ': ' + SECTIONS[i]);
  }

  log.info('report complete — returning to idle on its own');
  return { sections: SECTIONS.length };
}

module.exports = { buildMonthlyReport };
