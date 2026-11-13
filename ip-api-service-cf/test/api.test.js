import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import worker from '../src/index.js';

const origin = 'https://worker.example';
const unavailableBucket = {
  async get() { throw new Error('R2 unavailable'); },
};

function request(path, env, options) {
  return worker.fetch(new Request(new URL(path, origin), options), env);
}

async function assertJson(response, status, body, cacheControl) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(response.headers.get('Cache-Control'), cacheControl);
  assert.deepEqual(await response.json(), body);
}

test('time uses Asia/Taipei and changes date at local midnight without caching', async (t) => {
  const midnight = Date.parse('2026-12-31T16:00:00.000Z');
  const clock = t.mock.method(Date, 'now', () => midnight - 1);
  await assertJson(await request('/api/time', {}), 200, {
    ok: true, unixMs: midnight - 1, date: '2026-12-31',
  }, 'no-store');

  clock.mock.mockImplementation(() => midnight);
  await assertJson(await request('/api/time', {}), 200, {
    ok: true, unixMs: midnight, date: '2027-01-01',
  }, 'no-store');

  // Shanghai observed daylight saving then, while Taipei was UTC+8.
  const historical = Date.parse('1986-07-01T15:30:00.000Z');
  clock.mock.mockImplementation(() => historical);
  await assertJson(await request('/api/time', {}), 200, {
    ok: true, unixMs: historical, date: '1986-07-01',
  }, 'no-store');
});

test('device model matches a verified brand and complete model code', async () => {
  const cases = [
    [' apple ', 'IPHONE17,1', 'iPhone 16 Pro'],
    ['Apple', 'A3294', 'iPhone 16 Pro'],
    ['Apple', 'A1332', 'iPhone 4'],
    ['Apple', 'A1203', 'iPhone'],
    ['Apple', 'iPhone1,1', 'iPhone'],
    ['Samsung', 'sm-s9280', 'Galaxy S24 Ultra'],
    ['samsung', 'SM-G975F/DS', 'Galaxy S10+'],
    ['Xiaomi', 'M2012K11AG', 'POCO F3'],
    ['POCO', 'M2012K11AG', 'POCO F3'],
    ['Xiaomi', '2602DPT53G', 'Xiaomi 17T'],
    ['Xiaomi', '2602DPT53I', 'Xiaomi 17T'],
    ['Xiaomi', '2602EPTC0G', 'Xiaomi 17T Pro'],
    ['Xiaomi', '2602EPTC0R', 'Xiaomi 17T Pro'],
    ['vivo', 'V2413', 'vivo X200 Pro'],
  ];
  for (const [brand, model, displayName] of cases) {
    const params = new URLSearchParams({ brand, model });
    const res = await request(`/api/device-model?${params}`, {});
    await assertJson(res, 200, { ok: true, matched: true, displayName }, 'public, max-age=86400');
  }
});

test('device model returns a miss for unknown, ambiguous and mismatched input', async () => {
  const cases = [
    ['Apple', 'iPhone99,99'],
    ['Huawei', 'MNA-AL00'], // Huawei assigns this model to both P60 Pro and P60 Art.
    ['Xiaomi', '25113PN0EG'], // Xiaomi's Chile regulatory listing assigns this code to two names.
    ['Samsung', 'iPhone17,1'],
    ['Redmi', 'M2012K11AG'],
    ['Samsung', 'SM-S928'],
    ['Samsung', 'SM-S9280-extra'],
    ['Apple', 'iPhone'],
  ];
  for (const [brand, model] of cases) {
    const params = new URLSearchParams({ brand, model });
    const res = await request(`/api/device-model?${params}`, {});
    await assertJson(res, 200, { ok: true, matched: false, displayName: null }, 'public, max-age=300');
  }
});

test('new routes reject non-GET methods and model lookup requires both parameters', async () => {
  for (const path of ['/api/time', '/api/device-model']) {
    const res = await request(path, {}, { method: 'POST' });
    assert.equal(res.headers.get('Allow'), 'GET');
    await assertJson(res, 405, { ok: false, error: 'method_not_allowed' }, 'no-store');
  }

  for (const query of ['brand=Apple', 'brand=%20&model=iPhone17%2C1', 'brand=Apple&model=x&model=y']) {
    await assertJson(await request(`/api/device-model?${query}`, {}), 400, {
      ok: false, matched: false, displayName: null, error: 'invalid_parameters',
    }, 'no-store');
  }
});

test('time and model lookup remain public with R2 unavailable and IP auth configured', async (t) => {
  const outbound = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected outbound request'); });
  const bucket = { ...unavailableBucket };
  const readR2 = t.mock.method(bucket, 'get');
  const env = { DB_BUCKET: bucket, AUTH_TOKEN: 'test-token' };

  await assert.rejects(request('/api/lookup?ip=8.8.8.8&token=test-token', env), /R2 unavailable/);
  assert.equal(readR2.mock.callCount(), 1);

  const res = await request('/api/time', env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const time = await res.json();
  assert.equal(time.ok, true);
  assert.equal(Number.isInteger(time.unixMs), true);
  assert.match(time.date, /^\d{4}-\d{2}-\d{2}$/);

  await assertJson(await request('/api/device-model?brand=Apple&model=iPhone17%2C1', env), 200, {
    ok: true, matched: true, displayName: 'iPhone 16 Pro',
  }, 'public, max-age=86400');
  assert.equal(readR2.mock.callCount(), 1);
  assert.equal(outbound.mock.callCount(), 0);
});

test('IP retains the IN response, both token inputs, and existing R2 loading behavior', async () => {
  const cache = 'public, max-age=3600';
  const v4 = '/api/lookup?ip=113.118.113.77';
  const v6 = '/api/lookup?ip=240e%3A3b7%3A3272%3Ad8d0%3Adb09%3Ac067%3A8d59%3A539e';
  const region = {
    国家: '中国', 省份: '广东省', 城市: '深圳市', 运营商: '电信', 国家代码: 'CN',
    位置: '广东 深圳', 原始数据: '中国|广东省|深圳市|电信|CN',
  };
  const expectedV4 = { ip: '113.118.113.77', 版本: 4, ...region };
  const expectedV6 = { ip: '240e:3b7:3272:d8d0:db09:c067:8d59:539e', 版本: 6, ...region };
  const protectedEnv = { AUTH_TOKEN: 'test-token', DB_BUCKET: unavailableBucket };

  await assertJson(await request(v4, protectedEnv), 401, {
    错误: '未授权', 说明: '认证失败，请提供正确的token',
  }, cache);
  await assertJson(await request(`${v4}&token=test-token`, protectedEnv, {
    headers: { Authorization: 'Bearer wrong' },
  }), 401, { 错误: '未授权', 说明: '认证失败，请提供正确的token' }, cache);
  await assertJson(await request('/api/lookup', protectedEnv, {
    headers: { Authorization: 'Bearer test-token' },
  }), 400, { 错误: '缺少IP', 说明: '请提供 ip 参数，例如 /api/lookup?ip=8.8.8.8' }, cache);
  await assertJson(await request('/api/lookup?ip=abc', {}), 400, {
    错误: '无效IP', 说明: '无效的 IP 地址: abc',
  }, cache);
  await assertJson(await request(v4, { DB_BUCKET: { async get() { return null; } } }), 503, {
    错误: '服务不可用', 说明: 'IPv4 数据库未加载',
  }, cache);

  const loadedKeys = [];
  const uploaded = new Date('2026-04-13T01:36:00.000Z');
  const bucket = {
    async get(key) {
      loadedKeys.push(key);
      return {
        uploaded,
        arrayBuffer: () => readFile(new URL(`../../ip-api-service/data/${key}`, import.meta.url)),
      };
    },
  };
  const env = { DB_BUCKET: bucket };
  await assertJson(await request(v4, env, {
    headers: { Accept: 'application/json', 'User-Agent': 'IN-Server/1.0' },
  }), 200, expectedV4, cache);
  assert.deepEqual(loadedKeys, ['ip2region_v4.xdb']);

  const authenticated = { ...env, AUTH_TOKEN: 'test-token' };
  await assertJson(await request(`${v4}&token=test-token`, authenticated), 200, expectedV4, cache);
  await assertJson(await request(v6, authenticated, {
    headers: { Authorization: 'Bearer test-token' },
  }), 200, expectedV6, cache);
  assert.deepEqual(loadedKeys, ['ip2region_v4.xdb', 'ip2region_v6.xdb']);

  const readiness = {
    IPv4已就绪: true, IPv6已就绪: true,
    IPv4数据更新时间: uploaded.toISOString(), IPv6数据更新时间: uploaded.toISOString(),
  };
  await assertJson(await request('/', env), 200, {
    服务: 'ip2region-api', 用法: '/api/lookup?ip=8.8.8.8', ...readiness,
  }, cache);
  await assertJson(await request('/api/health', env), 200, { 状态: '正常', ...readiness }, cache);
});
