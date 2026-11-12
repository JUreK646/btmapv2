import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import sharp from 'sharp';
import {openDatabase} from '../server/database.ts';
import {createApp} from '../server/app.ts';
import {MAX_JSON_BODY_BYTES, MAX_PHOTO_BODY_BYTES, MAX_PHOTO_BYTES} from '../shared/uploadLimits.ts';

test('nginx lets through every request body the API accepts', () => {
  const conf = readFileSync(resolve('nginx.conf'), 'utf8');
  const match = conf.match(/client_max_body_size\s+(\d+)([kmg]?)\s*;/i);
  assert.ok(match, 'nginx.conf must set client_max_body_size (the default of 1m rejects photo uploads)');
  const unit = {'': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3}[match[2].toLowerCase()]!;
  assert.ok(Number(match[1]) * unit >= MAX_PHOTO_BODY_BYTES, 'client_max_body_size is lower than MAX_PHOTO_BODY_BYTES');
  // A full-size photo must still fit once it is base64-encoded.
  assert.ok(MAX_PHOTO_BODY_BYTES > Math.ceil(MAX_PHOTO_BYTES / 3) * 4);
});

test('a photo close to the 15 MB limit is accepted, oversized bodies get a clear 413', async () => {
  const db = openDatabase(':memory:');
  db.prepare("INSERT INTO towers(id,stationId,address,province,lat,lng,operators,source,status) VALUES('community','C1','Kraków, Długa 1','Małopolskie',50.06,19.94,'[]','BTMAP','APPROVED')").run();
  const server = createApp(db).listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as {port: number}).port}/api`;
  let cookie = '';
  const send = (method: string, path: string, body?: string) => fetch(base + path, {method, headers: {'Content-Type': 'application/json', cookie}, body});
  let commentId = '';
  try {
    const registration = await send('POST', '/auth/register', JSON.stringify({email: 'photo@example.com', nick: 'Fotograf', password: 'long-password-123'}));
    assert.equal(registration.status, 201); cookie = registration.headers.get('set-cookie')!.split(';')[0];

    // Uncompressed noise: a 13 MB PNG, i.e. a ~17 MB JSON body - above both the old nginx (1 MB) and Express (15 MB) limits.
    const width = 2200, height = 2000;
    const photo = await sharp(randomBytes(width * height * 3), {raw: {width, height, channels: 3}}).png({compressionLevel: 0}).toBuffer();
    assert.ok(photo.length > 12 * 1024 * 1024 && photo.length <= MAX_PHOTO_BYTES, `unexpected test photo size ${photo.length}`);
    const upload = await send('POST', '/towers/community/comments', JSON.stringify({text: 'Widok z dołu', imageBase64: `data:image/png;base64,${photo.toString('base64')}`}));
    assert.equal(upload.status, 201);
    const comment = await upload.json() as {id: string; photoUrl: string};
    commentId = comment.id;
    assert.match(comment.photoUrl, /^\/api\/uploads\/[a-f0-9-]+\.webp$/);
    const storedFile = resolve('data', 'uploads', comment.photoUrl.split('/').pop()!);
    assert.ok(existsSync(storedFile));
    const served = await send('GET', comment.photoUrl.replace(/^\/api/, ''));
    assert.equal(served.status, 200); assert.equal(served.headers.get('content-type'), 'image/webp');
    const meta = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
    assert.equal(meta.format, 'webp'); assert.ok(meta.width! <= 1920 && meta.height! <= 1920);

    const tooLarge = await send('POST', '/towers/community/comments', JSON.stringify({text: 'x', imageBase64: 'A'.repeat(MAX_PHOTO_BODY_BYTES + 1024)}));
    assert.equal(tooLarge.status, 413); assert.match((await tooLarge.json()).error, /15 MB/);

    // Endpoints that never carry photos keep a small limit.
    const bigLogin = await send('POST', '/auth/login', JSON.stringify({email: 'a@b.pl', password: 'x'.repeat(MAX_JSON_BODY_BYTES + 1024)}));
    assert.equal(bigLogin.status, 413);
  } finally {
    if (commentId) {
      const removed = await send('DELETE', `/towers/community/comments/${commentId}`);
      assert.equal(removed.status, 200);
      assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM photos').get()!.count), 0);
    }
    await new Promise<void>(done => server.close(() => done())); db.close();
  }
});
