'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Loads a .env file into process.env, if one exists.
 *
 * Node 20.6 added `node --env-file=.env`, and Node 22.9 added
 * `--env-file-if-exists` for the case where the file is optional. Neither works on
 * Node 18, which these examples still support, and a missing file is fatal with the
 * former — so this is twenty lines instead of a dependency, and it stays quiet when
 * there is nothing to load.
 *
 * Variables already set in the environment win. That is the usual convention, and
 * it is what lets a one-off `SYNAPSYS_WORKER_NAME=x npm start` override the file
 * without editing it.
 */
function loadEnv(file) {
  const target = file || path.join(__dirname, '..', '.env');

  let contents;
  try {
    contents = fs.readFileSync(target, 'utf8');
  } catch (error) {
    // No .env is the normal case when the settings come from the shell.
    if (error.code === 'ENOENT') return { loaded: false, count: 0 };
    throw error;
  }

  let count = 0;
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.charAt(0) === '#') continue;

    const equals = line.indexOf('=');
    if (equals === -1) continue;

    const key = line.slice(0, equals).trim();
    if (key === '') continue;

    let value = line.slice(equals + 1).trim();
    // Strip one layer of matching quotes, so a value with spaces can be quoted.
    if (value.length >= 2 &&
        ((value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') ||
         (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'"))) {
      value = value.slice(1, -1);
    }

    // The shell wins.
    if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    process.env[key] = value;
    count++;
  }

  return { loaded: true, count: count };
}

module.exports = { loadEnv };
