# Synapsys Node.js SDK — examples

Working applications built on [`@synapsys-io/sdk`](https://www.npmjs.com/package/@synapsys-io/sdk),
installed from npm like any other dependency.

One process of every kind, in CommonJS, ESM and Express, plus a scale fixture for
loading Core. Every process prints as it works, and that output is streamed to Core
and shown against the run — so you can start something from the console and watch it
happen from both sides.

## Requirements

- Node.js 18 or later (the SDK itself supports 16; these examples use a little more)
- A reachable Synapsys Core instance
- A worker token, created in the Core console

## Setup

```bash
npm install
```

Two settings are required. Put them in a `.env` file:

```bash
cp .env.example .env
```

```bash
SYNAPSYS_CORE_URL=http://localhost:8080
SYNAPSYS_CORE_TOKEN=syn_your_token_here
```

Or export them in your shell instead — **`.env` is optional**, and anything already
set in the environment wins over the file, so a one-off override needs no edit:

```bash
SYNAPSYS_WORKER_NAME=scratch npm start
```

Then:

```bash
npm start
```

<sub>The `.env` file is read by `src/load-env.js`, twenty lines and no dependency.
Node 20.6 added `--env-file` natively, but it is fatal when the file is missing, and
neither it nor `--env-file-if-exists` exists on the Node 18 these examples support.</sub>

Open <http://localhost:3000>. The page refreshes every second and shows what the SDK
is reporting to Core for each process: state, `ackToken` and `runId`. Machine-readable
at `/json`.

Nothing runs until you start it from the Core console. That is the point — every
process below sits at `idle` waiting for a command.

## What to run

| Command | Port | What it is |
| --- | --- | --- |
| `npm start` | 3000 | The main example. One process of every kind. Read `app.cjs` first. |
| `npm run start:esm` | 3001 | The same wiring in ESM, with top-level `await`. |
| `npm run start:express` | 3002 | Adoption inside an existing Express app. |
| `npm run start:bulk` | 3003 | 100 endless + 100 progressive, for loading Core. |

Each uses a different worker name, so you can run several at once and see them side
by side in the console.

## The processes

All nine live in `app.cjs`, each with a comment explaining what it demonstrates. The
work itself is in `src/jobs/`, and **none of those files import Synapsys** — that is
deliberate, and it is the adoption argument in miniature.

### Endless — runs until stopped

| Process | What to watch |
| --- | --- |
| `invoice-poller` | The canonical loop. Start it and log lines appear in Core every 5s, numbered per run. |
| `feed-subscriber` | Makes a request that takes 10s. Stop it mid-request: it aborts in milliseconds rather than waiting. |
| `cache-warmer` | Holds a resource. Stop it and `onStop` releases it, visibly, in the log. |
| `legacy-nightly-sync` | A callback-style function from 2011, registered by reference. The file was not modified. |

### Progressive — runs to completion

| Process | What to watch |
| --- | --- |
| `monthly-report` | Finishes on its own after ~5s and returns itself to `idle`. No stop involved. |
| `bulk-import` | 40 items, cancellable between them. Stop it mid-run: it goes to `idle`, not `failed`. |
| `slow-migration` | 20 steps of 3s. Long enough to always catch mid-run. |
| `flaky-importer` | Throws on purpose. Ends `failed`, with the stack trace visible in Core. Every third start succeeds. |
| `checksum-cruncher` | 30s of real CPU work on a `worker_thread`. Heartbeats keep flowing throughout. |

## Things worth trying

**Watch a command take effect.** Start `invoice-poller` from Core. Within one
heartbeat the status page flips to `running` and `ackToken` advances. Core only
considers a command applied once the worker reports that token back — if the two
views ever disagree, `ackToken` is the field that explains why.

**Stop something mid-flight.** Start `feed-subscriber`, wait until the log says it is
requesting, then stop it. It aborts after a couple of seconds instead of the full ten,
because `stop.signal` is handed to the HTTP request:

```
14:41:58.785  feed-subscriber  requesting http://127.0.0.1:3000/slow (takes ~10s)
14:42:03.797  feed-subscriber  request aborted after 5012ms — stop honoured mid-flight
```

**Break something.** Start `flaky-importer`. It fails, holds `failed` across
heartbeats, and the stack trace appears in the Core console as error output. Start it
again — `failed` is a legal starting point, and every third attempt succeeds.

**Kill Core while things are running.** Stop the Core process. The worker logs one
warning, keeps every process running, and reconnects when Core returns. Core being
down is not a reason to stop doing work.

**Remove it.** Delete the four marked blocks in `express-app.cjs` and the app still
runs. That is the removability requirement, and it is worth confirming yourself.

## The one about CPU-bound work

Node runs your processes on one event loop. This matters more than it does in a
thread-per-process runtime, and the example makes the difference concrete.

`checksum-cruncher` does 30 seconds of genuine arithmetic on a `worker_thread`. The
main thread stays free, heartbeats keep flowing, other processes keep running, and
stopping it terminates the thread outright — real preemption, no cooperation needed.

`event-loop-hog` does the same arithmetic the naive way, directly on the main thread.
It is **opt-in**:

```bash
EXAMPLE_ENABLE_HOG=true npm start
```

Start it from Core and watch what happens: heartbeats stop, every other process
freezes, the status page stops answering, and Core marks the worker stale. Stop does
nothing until it finishes.

That last part is the one worth sitting with. `throwIfCancelled()` is called on every
round, but it can never observe the stop — cancellation arrives as a message, and
messages are delivered by the event loop the function is monopolising. On the JVM,
`Thread.interrupt()` reaches a thread spinning in a loop. On Node there is nothing to
interrupt with.

It is here to be understood, not copied. `src/jobs/event-loop-hog.js` explains it in
full.

## Loading Core

```bash
npm run start:bulk
```

100 endless + 100 progressive processes on one worker, all registered from a loop.
Sizes are runtime settings:

```bash
EXAMPLE_ENDLESS=250 EXAMPLE_PROGRESSIVE=250 npm run start:bulk
```

```bash
EXAMPLE_QUIET=true npm run start:bulk     # register them, but print nothing
```

Note what stays constant as the count grows: one HTTP request per interval carries
every process, so the payload grows but the request count does not. If Core starts
lagging, look at payload size and log volume rather than connection count —
`EXAMPLE_QUIET=true` isolates the second from the first.

## Running without a Core at all

```bash
SYNAPSYS_ENABLED=false npm start
```

The SDK becomes a complete no-op: no timer, no network call, and `process.stdout.write`
is left untouched. It does not even require `SYNAPSYS_CORE_URL`. This is what makes
the dependency invisible to a test suite.

## Settings

Every SDK setting can be passed in the options object or set in the environment; the
options object wins. See `.env.example` for the ones these examples use, and the
[SDK README](https://www.npmjs.com/package/@synapsys-io/sdk) for the full table.

Example-specific:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | per entry point | Port for the status page. |
| `EXAMPLE_ENABLE_HOG` | `false` | Register the deliberately blocking process. |
| `EXAMPLE_ENDLESS` | `100` | Endless processes in the bulk fixture. |
| `EXAMPLE_PROGRESSIVE` | `100` | Progressive processes in the bulk fixture. |
| `EXAMPLE_QUIET` | `false` | Silence the bulk fixture's output. |

## Layout

```
app.cjs               main example — all nine processes, commented
app.mjs               ESM variant
express-app.cjs       Express variant, Synapsys confined to four marked blocks
bulk.cjs              scale fixture
src/load-env.js       optional .env support, no dependency
src/logger.js         timestamped output — this is what Core captures
src/status-server.js  the live status page, and the /slow endpoint
src/jobs/             the actual work. No Synapsys imports anywhere in here.
src/workers/          worker_thread target for the CPU-bound example
```

## License

Apache License 2.0.
