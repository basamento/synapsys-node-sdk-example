// Side-effect module: loading .env before any other import is evaluated.
//
// In ESM every `import` in a file runs before the file's own statements, so calling
// loadEnv() at the top of app.mjs would still be too late for anything that reads
// process.env while being imported. Importing this first is the ordering fix.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('./load-env').loadEnv();
