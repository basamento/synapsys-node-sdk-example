'use strict';

const http = require('http');
const { app } = require('./logger');

/**
 * A live view of what the SDK is reporting to Core, served from the same process.
 *
 * This exists so you can see a command take effect from two directions at once:
 * press Start in the Core console, and watch `currentState` flip here and the log
 * lines start appearing there. If the two ever disagree, the interesting field is
 * `ackToken` — Core only considers a command applied once the worker reports the
 * token back.
 */
function createStatusServer(synapsys, extras) {
  const getExtras = extras || function () { return {}; };

  return http.createServer(function (request, response) {
    const url = request.url.split('?')[0];

    // A deliberately slow endpoint, used by the feed-subscriber process to show
    // an in-flight request being aborted by a stop command.
    if (url === '/slow') {
      const timer = setTimeout(function () {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('feed payload delivered at ' + new Date().toISOString());
      }, 10000);
      request.on('close', function () { clearTimeout(timer); });
      return;
    }

    const snapshot = {
      worker: synapsys.config.workerName,
      coreUrl: synapsys.config.coreUrl,
      heartbeatIntervalMs: synapsys.config.heartbeatInterval,
      consoleCapture: synapsys.config.captureConsole,
      enabled: synapsys.config.enabled,
      processes: synapsys.processes.map(function (p) {
        return {
          name: p.name,
          type: p.type,
          currentState: p.currentState,
          ackToken: p.ackToken,
          runId: p.runId
        };
      }),
      counters: getExtras()
    };

    if (url === '/json') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(snapshot, null, 2));
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(render(snapshot));
  });
}

const STATE_COLOURS = {
  idle: '#6b7280',
  running: '#15803d',
  stopping: '#b45309',
  failed: '#b91c1c'
};

function render(snapshot) {
  const rows = snapshot.processes.map(function (p) {
    return '<tr>' +
      '<td><code>' + escapeHtml(p.name) + '</code></td>' +
      '<td>' + p.type + '</td>' +
      '<td><strong style="color:' + (STATE_COLOURS[p.currentState] || '#111') + '">' +
        p.currentState + '</strong></td>' +
      '<td style="text-align:right">' + p.ackToken + '</td>' +
      '<td style="text-align:right">' + (p.runId === null ? '—' : p.runId) + '</td>' +
      '</tr>';
  }).join('\n');

  const counters = Object.keys(snapshot.counters).map(function (key) {
    return '<li><code>' + escapeHtml(key) + '</code>: ' +
      escapeHtml(String(snapshot.counters[key])) + '</li>';
  }).join('\n');

  return [
    '<!doctype html><meta charset="utf-8">',
    '<meta http-equiv="refresh" content="1">',
    '<title>' + escapeHtml(snapshot.worker) + ' — Synapsys example</title>',
    '<style>',
    'body{font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;margin:2rem;max-width:60rem}',
    'table{border-collapse:collapse;width:100%;margin:1rem 0}',
    'th,td{border-bottom:1px solid #e5e7eb;padding:.4rem .6rem;text-align:left}',
    'th{font-weight:600;color:#6b7280;font-size:12px;text-transform:uppercase}',
    'h1{font-size:1.1rem}h2{font-size:.95rem;color:#6b7280;margin-top:2rem}',
    'code{background:#f3f4f6;padding:.1rem .3rem;border-radius:3px}',
    '</style>',
    '<h1>' + escapeHtml(snapshot.worker) + '</h1>',
    '<p>core <code>' + escapeHtml(String(snapshot.coreUrl)) + '</code> · ' +
      'heartbeat every ' + (snapshot.heartbeatIntervalMs / 1000) + 's · ' +
      'console capture ' + (snapshot.consoleCapture ? 'on' : 'off') +
      ' · page refreshes every second</p>',
    '<table><thead><tr><th>process</th><th>type</th><th>state</th>',
    '<th style="text-align:right">ackToken</th><th style="text-align:right">runId</th>',
    '</tr></thead><tbody>',
    rows,
    '</tbody></table>',
    '<h2>counters</h2><ul>' + counters + '</ul>',
    '<h2>what to try</h2>',
    '<p>Start and stop these from the Core console. The state here should change ' +
    'within one heartbeat, and the log lines each process prints appear in Core ' +
    'against that run.</p>'
  ].join('\n');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function listen(server, port) {
  return new Promise(function (resolve) {
    server.listen(port, function () {
      app('status page on http://localhost:' + port + '  (JSON at /json)');
      resolve(server);
    });
  });
}

module.exports = { createStatusServer, listen };
