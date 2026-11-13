import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/index.js';
import { CATALOG_KEY } from '../src/device-catalog.js';
import { buildCatalog, r2CatalogStore, syncCatalog } from '../scripts/sync-mobilemodels.js';

const REVISION = 'a'.repeat(40);
const NEXT_REVISION = 'b'.repeat(40);
const LICENSE_BLOB = 'bfef380bf7d9cb74ec9ba533b37c3fbeef3bdc09';
const START = new Date('2026-11-13T00:00:00Z');
const HEADER = 'model,dtype,brand,brand_title,code,code_alias,model_name,ver_name,source_file';
const SAMPLE = '\ufeff' + [HEADER,
  'V2408A,mob,vivo,vivo,,PD2408,iQOO 13,,vivo_cn',
  'V2413,mob,vivo,vivo,,PD2405F,X200 Pro,,vivo_global_en',
  'A3294,mob,apple,Apple,D93AP,"iPhone17,1",iPhone 16 Pro,"China mainland, Hong Kong, Macao",apple_all_en',
  'A3294,mob,apple,Apple,D93AP,"iPhone17,1",iPhone 16 Pro,,apple_cn',
  'SM-S9280,mob,samsung,三星,,e3q,Galaxy S24 Ultra,,samsung_cn',
  'SM-S9280,mob,samsung,Samsung,,e3q,Galaxy S24 Ultra,China,samsung_global_en',
  'M2012K11AG,mob,xiaomi,Xiaomi,K11A,alioth,POCO F3,Global,xiaomi_en',
  '22021211RG,mob,xiaomi,Xiaomi,,,First name,,xiaomi',
  '22021211RG,mob,xiaomi,Xiaomi,,,Second name,,xiaomi_en',
  '2602EPTC0G,mob,xiaomi,小米,P12U,warhol,Xiaomi 17T Pro,国际版,xiaomi',
  'M2012K11AI,mob,xiaomi,小米,K11A,"alioth, aliothin",小米 11X,印度版,xiaomi',
  'M2012K11AI,mob,xiaomi,Xiaomi,K11A,"alioth, aliothin",Mi 11X,India,xiaomi_en',
  '22081212C,mob,xiaomi,Xiaomi,L12,diting,Redmi K50 Ultra,China,xiaomi_en',
  '22081212C,mob,xiaomi,小米,L12,diting,Redmi K50 至尊版,,xiaomi_cn',
  'M2006C3LI,mob,xiaomi,Xiaomi,,,Redmi 9A,India,xiaomi_en',
  'M2006C3LI,mob,xiaomi,Xiaomi,,,Redmi 9A,Sport India,xiaomi_en',
  'M8,mob,meizu,魅族,,,魅族 M8,,meizu',
  'M8,mob,meizu,MEIZU,,,MEIZU M8,,meizu_en',
  'SHARK KLE-A0,mob,blackshark,黑鲨,,,腾讯黑鲨游戏手机 3,全网通版,blackshark',
  'SHARK KLE-A0,mob,blackshark,BlackShark,,,Black Shark 3S,China,blackshark_en',
  'SHARK KLE-A0,mob,blackshark,BlackShark,,,Black Shark 3,China,blackshark_en',
  'ASUS_AI2401_E,mob,asus,Asus,,,ROG Phone 8,,asus_en',
  'ASUS_AI2401_E,mob,asus,Asus,,,ROG Phone 8,Pro (US),asus_en',
  'ASUS_AI2401_D,mob,asus,Asus,,,ROG Phone 8,Pro (Worldwide),asus_en',
  'NLA-LX1,mob,honor,HONOR,,,HONOR X5c,,honor_global_en',
  'NLA-LX1,mob,honor,HONOR,,,HONOR X5c,Plus,honor_global_en',
  'NX724J,mob,nubia,努比亚,,,Flip,5G,nubia_cn',
  'NX724J,mob,nubia,努比亚,,,Flip,5G S,nubia_cn',
  'MNA-AL00,mob,huawei,华为,,Mona,HUAWEI P60 Pro,,huawei_cn',
  'MNA-AL00,mob,huawei,华为,,Mona,HUAWEI P60 Art,,huawei_cn',
  'MNA-AL00,mob,huawei,HUAWEI,,Mona,HUAWEI P60 Pro,,huawei_global_en',
  'SAMECODE,mob,vivo,vivo,,,iQOO Sample,,vivo_cn',
  'SAMECODE,mob,vivo,Vivo Electronics,,,vivo Sample,,vivo_global_en',
  'EXAMPLE,mob,nothing,Nothing,,,"Phone ""Example"", Pro","Global\r\nEdition",nothing',
  'PAD1,pad,apple,Apple,,"iPad1,1",iPad,,apple_all',
].join('\r\n');

test('parses actual CSV conventions and preserves exact matches, scoped aliases and ambiguity', () => {
  const { brands } = buildCatalog(SAMPLE, REVISION, START.toISOString());
  assert.equal(brands.apple['iphone17,1'], 'iPhone 16 Pro');
  assert.equal(brands.apple.a3294, 'iPhone 16 Pro');
  assert.equal(brands.apple['ipad1,1'], undefined);
  assert.equal(brands.apple.d93ap, undefined);
  assert.equal(brands.vivo.v2408a, 'iQOO 13');
  assert.equal(brands.iqoo.v2408a, 'iQOO 13');
  assert.equal(brands.iqoo.v2413, undefined);
  assert.equal(brands.vivo.v2413, 'vivo X200 Pro');
  assert.equal(brands.samsung['sm-s9280'], 'Galaxy S24 Ultra');
  assert.equal(brands['三星']['sm-s9280'], 'Galaxy S24 Ultra');
  assert.equal(brands.poco.m2012k11ag, 'POCO F3');
  assert.equal(brands['小米']['2602eptc0g'], 'Xiaomi 17T Pro');
  assert.equal(brands.xiaomi.m2012k11ai, 'Mi 11X');
  assert.equal(brands.redmi['22081212c'], 'Redmi K50 Ultra');
  assert.equal(brands.redmi.m2006c3li, null);
  assert.equal(brands['魅族'].m8, 'MEIZU M8');
  assert.equal(brands.blackshark['shark kle-a0'], null);
  assert.equal(brands.asus.asus_ai2401_d, 'ROG Phone 8 Pro');
  assert.equal(brands.asus.asus_ai2401_e, null);
  assert.equal(brands.honor['nla-lx1'], null);
  assert.equal(brands.nubia.nx724j, null);
  assert.equal(brands.huawei['mna-al00'], null);
  assert.equal(brands['华为']['mna-al00'], null);
  assert.equal(brands.iqoo.samecode, null);
  assert.equal(brands['vivo electronics'].samecode, null);
  assert.equal(brands.nothing.example, 'Phone "Example", Pro');
  assert.throws(() => buildCatalog(SAMPLE.replace('source_file', 'old_header'), REVISION, START.toISOString()), /columns/);
  assert.throws(() => buildCatalog(`${SAMPLE}\r\n"unfinished`, REVISION, START.toISOString()), /Quote/);
});

test('sync publishes one validated R2 object and preserves it on upstream, schema and write failures', async () => {
  let stored = null;
  let puts = 0;
  let downloads = 0;
  let revision = REVISION;
  let license = LICENSE_BLOB;
  let csvResponse = () => new Response(`${SAMPLE}\r\n${Array.from({ length: 5_000 }, (_, index) =>
    `TEST${index},mob,example,Example,,,Example Phone,,example`).join('\r\n')}`);
  let writeStatus = 200;
  let readStatus = 200;
  let invalidBody = false;
  const fetcher = async (url, options) => {
    if (url.startsWith('https://api.cloudflare.com/')) {
      assert.match(url, new RegExp(`/r2/buckets/ip2region-db/objects/${CATALOG_KEY}$`));
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      if (options.method === 'PUT') {
        puts++;
        if (writeStatus !== 200) return new Response(null, { status: writeStatus });
        stored = JSON.parse(options.body);
        return Response.json({ success: true });
      }
      if (readStatus !== 200) return new Response(null, { status: readStatus });
      if (invalidBody) return new Response('{invalid');
      return stored ? Response.json(stored) : new Response(null, { status: 404 });
    }
    if (url.startsWith('https://api.github.com/')) {
      assert.equal(options.headers, undefined);
      if (url.includes('/commits?')) return Response.json([{ sha: revision }]);
      if (url.endsWith('/contents/LICENSE?ref=main')) return Response.json({ sha: license });
      assert.ok(url.endsWith(`/contents/LICENSE?ref=${revision}`));
      return Response.json({ sha: license });
    }
    assert.equal(options.headers, undefined);
    assert.ok(url.endsWith(`/${revision}/models.csv`));
    downloads++;
    return csvResponse();
  };
  const store = r2CatalogStore('0'.repeat(32), 'test-token', fetcher);
  const options = { store, fetcher, now: () => START };

  assert.equal((await syncCatalog(options)).updated, true);
  assert.equal(stored.source.revision, REVISION);
  assert.equal(stored.updatedAt, START.toISOString());
  assert.equal(stored.brands.vivo.v2408a, 'iQOO 13');
  assert.ok(stored.modelCount >= 5_000);
  assert.equal((await syncCatalog(options)).updated, false);
  assert.equal(puts, 1);
  assert.equal(downloads, 1);
  const previous = stored;

  revision = NEXT_REVISION;
  license = 'c'.repeat(40);
  await assert.rejects(syncCatalog(options), /license changed/);
  license = LICENSE_BLOB;
  const goodCsvResponse = csvResponse;
  csvResponse = () => new Response(null, { status: 503 });
  await assert.rejects(syncCatalog(options), /Downloading MobileModels CSV/);
  csvResponse = () => new Response(SAMPLE);
  await assert.rejects(syncCatalog(options), /coverage dropped/);
  csvResponse = () => new Response(`${SAMPLE}\r\n${'TEST,mob,example,Example,,,Example Phone,,example\r\n'.repeat(5_000)}`);
  await assert.rejects(syncCatalog(options), /coverage dropped/);
  csvResponse = () => new Response(`${SAMPLE}\r\n${Array.from({ length: 5_000 }, (_, index) =>
    `TEST${index},mob,example,Example,,,First Phone,,example\r\nTEST${index},mob,example,Example,,,Second Phone,,example`).join('\r\n')}`);
  await assert.rejects(syncCatalog(options), /coverage dropped/);
  assert.equal(puts, 1);
  assert.equal(stored, previous);

  csvResponse = goodCsvResponse;
  writeStatus = 503;
  await assert.rejects(syncCatalog(options), /Publishing R2 catalog/);
  assert.equal(stored, previous);
  writeStatus = 200;
  const later = new Date(START.getTime() + 86_400_000);
  assert.equal((await syncCatalog({ ...options, now: () => later })).updated, true);
  assert.equal(stored.source.revision, NEXT_REVISION);
  assert.equal(stored.updatedAt, later.toISOString());
  assert.equal((await syncCatalog({ ...options, rebuild: true, now: () => later })).updated, true);
  assert.equal(puts, 4);

  readStatus = 503;
  await assert.rejects(syncCatalog(options), /Reading R2 catalog/);
  assert.equal(puts, 4);
  readStatus = 200;
  invalidBody = true;
  assert.equal((await syncCatalog(options)).updated, true);
  assert.equal(stored.source.revision, NEXT_REVISION);
  assert.equal(puts, 5);
});

test('Worker lazily checks R2, refreshes cached data and keeps the last good version on failure', async (t) => {
  const clock = t.mock.method(Date, 'now', () => START.getTime());
  let data = null;
  let etag = 'v1';
  let uploaded = START;
  let failRead = false;
  let reads = 0;
  let bodyReads = 0;
  const outbound = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected outbound request'); });
  const env = { MOBILEMODELS_ENABLED: 'true', DB_BUCKET: {
    async get(key, options) {
      assert.equal(key, CATALOG_KEY);
      reads++;
      if (failRead) throw new Error('R2 unavailable');
      if (!data) return null;
      if (options?.onlyIf.etagDoesNotMatch === etag) return { etag, uploaded };
      return { etag, uploaded, body: true, json() { bodyReads++; return data; } };
    },
  } };
  const call = (path) => worker.fetch(new Request(`https://example.test${path}`), env);
  const model = (brand, code) => call(`/api/device-model?${new URLSearchParams({ brand, model: code })}`);
  const payload = async (brand, code) => (await model(brand, code)).json();
  const moveClock = (ms) => clock.mock.mockImplementation(() => START.getTime() + ms);

  assert.equal((await call('/api/time')).headers.get('Cache-Control'), 'no-store');
  assert.equal((await call('/api/device-model?brand=Apple')).status, 400);
  assert.equal(reads, 0);
  const unavailable = await model('vivo', 'V2408A');
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('Cache-Control'), 'no-store');
  assert.equal((await unavailable.json()).matched, false);

  data = buildCatalog(SAMPLE, REVISION, START.toISOString());
  moveClock(30_000);
  const first = await model('vivo', 'V2408A');
  assert.deepEqual(await first.json(), { ok: true, matched: true, displayName: 'iQOO 13' });
  assert.equal(first.headers.get('Cache-Control'), 'public, max-age=300');
  assert.match(first.headers.get('Link'), /MobileModels.*license/);
  for (const [brand, code, name] of [
    ['iQOO', 'v2408a', 'iQOO 13'], ['Apple', 'iPhone17,1', 'iPhone 16 Pro'],
    ['Samsung', 'SM-S9280', 'Galaxy S24 Ultra'], ['Xiaomi', '2602EPTC0G', 'Xiaomi 17T Pro'],
    ['Samsung', 'SM-G975F/DS', 'Galaxy S10+'], ['Huawei', 'MNA-AL00', null],
    ['Xiaomi', 'M2012K11AI', 'Mi 11X'], ['Redmi', '22081212C', 'Redmi K50 Ultra'],
    ['ASUS', 'ASUS_AI2401_D', 'ROG Phone 8 Pro'], ['ASUS', 'ASUS_AI2401_E', null],
    ['POCO', '22021211RG', null], ['iQOO', 'unknown', null],
  ]) {
    assert.deepEqual(await payload(brand, code), { ok: true, matched: name !== null, displayName: name });
  }
  assert.equal(reads, 2);
  assert.equal(bodyReads, 1);

  moveClock(329_000);
  assert.equal((await model('iQOO', 'V2408A')).headers.get('Cache-Control'), 'public, max-age=1');
  assert.equal(reads, 2);

  moveClock(330_000);
  await payload('iQOO', 'V2408A');
  assert.equal(reads, 3);
  assert.equal(bodyReads, 1);
  failRead = true;
  moveClock(630_000);
  const stale = await model('iQOO', 'V2408A');
  assert.equal((await stale.json()).displayName, 'iQOO 13');
  assert.equal(stale.headers.get('Cache-Control'), 'no-store');
  assert.equal(reads, 4);
  failRead = false;
  data = { ...data, brands: { iqoo: { v2408a: 123 } } };
  etag = 'invalid';
  uploaded = new Date(START.getTime() + 640_000);
  moveClock(660_000);
  assert.equal((await payload('iQOO', 'V2408A')).displayName, 'iQOO 13');
  assert.equal(reads, 5);

  const updatedRows = [
    'V9999A,mob,vivo,vivo,,,iQOO Test,,vivo_cn',
    '22021211RI,mob,xiaomi,Xiaomi,,,Redmi Test,,xiaomi_en',
  ];
  data = buildCatalog([SAMPLE, ...updatedRows].join('\r\n'), NEXT_REVISION, uploaded.toISOString());
  etag = 'v2';
  moveClock(689_999);
  assert.equal((await payload('iQOO', 'V9999A')).matched, false);
  assert.equal((await payload('POCO', '22021211RI')).displayName, 'POCO F4');
  moveClock(690_000);
  assert.equal((await payload('iQOO', 'V9999A')).displayName, 'iQOO Test');
  assert.equal((await payload('Redmi', '22021211RI')).displayName, 'Redmi Test');
  assert.equal((await payload('POCO', '22021211RI')).matched, false);
  assert.equal(outbound.mock.callCount(), 0);
});
