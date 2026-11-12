import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {openDatabase} from '../server/database.ts';
import {createApp} from '../server/app.ts';

async function withApp(trustProxy: string | undefined, run: (login: (forwardedFor: string) => Promise<number>) => Promise<void>) {
  const db = openDatabase(':memory:');
  const server = createApp(db, undefined, {trustProxy}).listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as {port: number}).port}/api/auth/login`;
  // Every request reaches the API from the same socket address, exactly like requests proxied by nginx.
  const login = async (forwardedFor: string) => (await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Forwarded-For': forwardedFor},
    body: JSON.stringify({email: 'nobody@example.com', password: 'wrong-password'}),
  })).status;
  try { await run(login); } finally { await new Promise<void>(done => server.close(() => done())); db.close(); }
}

test('behind the proxy one visitor exhausting login attempts does not lock out everyone else', async () => {
  await withApp('1', async login => {
    for (let i = 0; i < 30; i++) assert.equal(await login('203.0.113.7'), 401);
    assert.equal(await login('203.0.113.7'), 429);
    assert.equal(await login('198.51.100.20'), 401);
    // nginx appends the real address, so a forged prefix does not give the blocked visitor a fresh bucket.
    assert.equal(await login('192.0.2.99, 203.0.113.7'), 429);
  });
});

test('without TRUST_PROXY the forwarded header is ignored, so it cannot be forged to dodge the limit', async () => {
  await withApp(undefined, async login => {
    for (let i = 0; i < 30; i++) assert.equal(await login(`203.0.113.${i}`), 401);
    assert.equal(await login('198.51.100.20'), 429);
  });
});

test('the bundled deployment tells the API about its nginx proxy', () => {
  assert.match(readFileSync(resolve('docker-compose.yml'), 'utf8'), /^\s*TRUST_PROXY:\s*\$\{TRUST_PROXY:-1\}/m);
  assert.match(readFileSync(resolve('nginx.conf'), 'utf8'), /proxy_set_header\s+X-Forwarded-For\s+\$proxy_add_x_forwarded_for;/);
});
