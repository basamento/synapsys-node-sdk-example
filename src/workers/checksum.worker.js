'use strict';

const { parentPort, workerData } = require('worker_threads');

/**
 * CPU-bound work, running on its own thread.
 *
 * Nothing here touches Synapsys. It is a plain worker that reports progress and can
 * be terminated by its parent — which is exactly what makes it cancellable without
 * cooperating with an AbortSignal.
 */
const rounds = workerData.rounds;
let sink = 0;

for (let round = 1; round <= rounds; round++) {
  // A genuinely expensive inner loop. This blocks *this thread*, which is the
  // entire point: the main thread stays free to answer heartbeats.
  for (let i = 0; i < 20000000; i++) {
    sink += Math.sqrt(i) * Math.sin(i);
  }
  parentPort.postMessage({ type: 'progress', round: round, of: rounds });
}

parentPort.postMessage({ type: 'done', checksum: Math.round(sink) });
