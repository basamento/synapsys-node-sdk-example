'use strict';

/**
 * Plain console output, with a timestamp and the process name.
 *
 * This is deliberately not a logging framework. Everything here goes to stdout or
 * stderr, which is exactly what the SDK's console capture picks up while a process
 * is running — so every line below also appears in the Core console, attached to
 * that specific run. Watching those two views agree is the point of this example.
 */

function stamp() {
  const now = new Date();
  return now.toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function pad(name) {
  return String(name).padEnd(20, ' ');
}

/** Returns a logger bound to one process name. */
function forProcess(name) {
  return {
    info: function (message) {
      console.log(stamp() + '  ' + pad(name) + '  ' + message);
    },
    /**
     * Goes to stderr, so the SDK records it at level `error` and the Core console
     * shows it as such.
     */
    error: function (message, error) {
      console.error(stamp() + '  ' + pad(name) + '  ' + message);
      if (error) console.error(error.stack || String(error));
    }
  };
}

/** For the application's own lines, which are outside any process and not captured. */
function app(message) {
  console.log(stamp() + '  ' + pad('[app]') + '  ' + message);
}

module.exports = { forProcess, app, stamp };
