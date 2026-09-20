#!/usr/bin/env node
// Run a real persistence journey against a disposable, loopback-only PostgreSQL cluster.
// No project .env file or inherited provider credentials are loaded.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = createServer();
await new Promise((resolveReady, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolveReady);
});
const port = server.address().port;
await new Promise(resolveClosed => server.close(resolveClosed));

const temporaryDirectory = mkdtempSync(resolve(tmpdir(), 'shiplog-journey-'));
const dataDirectory = resolve(temporaryDirectory, 'postgres');
const socketDirectory = resolve(temporaryDirectory, 'socket');
mkdirSync(socketDirectory);

const environment = {
  PATH: process.env.PATH,
  TMPDIR: temporaryDirectory,
  LANG: 'en_US.UTF-8',
  CI: '1',
  NODE_ENV: 'test',
  NODE_OPTIONS: '--experimental-vm-modules',
  SHIPLOG_LOCAL_JOURNEY: '1',
  DATABASE_URL: `postgresql://shiplog_journey@127.0.0.1:${port}/shiplog_journey`,
  JWT_SECRET: 'local-journey-only-not-a-production-secret',
  GITHUB_CLIENT_ID: 'local-journey-client',
  GITHUB_CLIENT_SECRET: 'local-journey-client-secret',
  APP_URL: 'http://localhost:3000',
  API_URL: 'http://localhost:3001',
  NO_COLOR: '1',
};

function run(command, args, cwd = temporaryDirectory) {
  const result = spawnSync(command, args, { cwd, env: environment, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

let started = false;
try {
  run('initdb', ['-D', dataDirectory, '-U', 'shiplog_journey', '--auth=trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', dataDirectory, '-l', resolve(temporaryDirectory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${socketDirectory}`, '-w', 'start']);
  started = true;
  run('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'shiplog_journey', 'shiplog_journey']);

  // Prisma CLI searches for .env beside the schema/cwd; both are isolated here.
  const schemaPath = resolve(temporaryDirectory, 'schema.prisma');
  copyFileSync(resolve(apiDirectory, 'prisma/schema.prisma'), schemaPath);
  run(process.execPath, [resolve(apiDirectory, 'node_modules/prisma/build/index.js'), 'db', 'push', '--schema', schemaPath, '--skip-generate']);
  run(process.execPath, [resolve(apiDirectory, 'node_modules/jest/bin/jest.js'), '--config', resolve(apiDirectory, 'jest.config.ts'), '--runInBand', '--watchman=false', '--testMatch', '**/integration/*.integration.ts'], apiDirectory);
  console.log('Local customer journey passed; no live providers were used.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (started || existsSync(resolve(dataDirectory, 'postmaster.pid'))) {
    spawnSync('pg_ctl', ['-D', dataDirectory, '-m', 'immediate', '-w', 'stop'], { env: environment, stdio: 'inherit' });
  }
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
