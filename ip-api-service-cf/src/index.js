const HEADER_INFO_LENGTH = 256;
const VECTOR_INDEX_COLS = 256;
const VECTOR_INDEX_SIZE = 8;
const XDB_IPV4_ID = 4;
const XDB_IPV6_ID = 6;

function parseIPv4(str) {
  const parts = str.split('.', 4);
  if (parts.length !== 4) throw new Error('invalid ipv4 address');
  const buf = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    const v = parseInt(parts[i], 10);
    if (isNaN(v) || v < 0 || v > 255) throw new Error('invalid ipv4 part');
    buf[i] = v & 0xFF;
  }
  return buf;
}

function parseIPv6(str) {
  const ps = str.split(':', 8);
  if (ps.length < 3) throw new Error('invalid ipv6 address');
  const buf = new Uint8Array(16);
  let dcNum = 0, offset = 0;
  for (let i = 0; i < ps.length; i++) {
    let s = ps[i].trim();
    if (s.length === 0) {
      if (dcNum > 0) throw new Error('invalid ipv6: multi double colon');
      let start = i, mi = ps.length - 1;
      for (i++; ;) {
        s = ps[i].trim();
        if (s.length > 0) { i--; break; }
        if (i >= mi) break;
        i++;
      }
      dcNum = 1;
      const padding = 8 - start - (mi - i);
      offset += 2 * padding;
      continue;
    }
    const v = parseInt(s, 16);
    if (isNaN(v) || v < 0 || v > 0xFFFF) throw new Error('invalid ipv6 part');
    buf[offset] = (v >> 8) & 0xFF;
    buf[offset + 1] = v & 0xFF;
    offset += 2;
  }
  return buf;
}

function parseIP(ipStr) {
  const hasDot = ipStr.indexOf('.') > -1;
  const hasColon = ipStr.indexOf(':') > -1;
  if (hasDot && !hasColon) return { bytes: parseIPv4(ipStr), version: 4 };
  if (hasColon) return { bytes: parseIPv6(ipStr), version: 6 };
  throw new Error('invalid ip address');
}

function detectIPVersion(ip) {
  const hasDot = ip.indexOf('.') > -1;
  const hasColon = ip.indexOf(':') > -1;
  if (hasDot && !hasColon) return 4;
  if (hasColon) return 6;
  return 0;
}

function ipv4Compare(ip1, buf, offset) {
  let j = offset + ip1.length - 1;
  for (let i = 0; i < ip1.length; i++, j--) {
    const a = ip1[i] & 0xFF;
    const b = buf[j] & 0xFF;
    if (a < b) return -1;
    if (a > b) return 1;
  }
  return 0;
}

function ipv6Compare(ip1, buf, offset) {
  for (let i = 0; i < ip1.length; i++) {
    const a = ip1[i] & 0xFF;
    const b = buf[offset + i] & 0xFF;
    if (a < b) return -1;
    if (a > b) return 1;
  }
  return 0;
}

function readUint16LE(buf, offset) {
  return (buf[offset] & 0xFF) | ((buf[offset + 1] & 0xFF) << 8);
}

function readUint32LE(buf, offset) {
  return (buf[offset] & 0xFF)
    | ((buf[offset + 1] & 0xFF) << 8)
    | ((buf[offset + 2] & 0xFF) << 16)
    | ((buf[offset + 3] & 0xFF) << 24);
}

function search(cBuffer, ipBytes, version) {
  const compare = version === 4 ? ipv4Compare : ipv6Compare;
  const indexSize = version === 4 ? 14 : 38;
  const bytes = ipBytes.length;
  const dBytes = bytes << 1;

  let sPtr = 0, ePtr = 0;
  const il0 = ipBytes[0], il1 = ipBytes[1];
  const idx = il0 * VECTOR_INDEX_COLS * VECTOR_INDEX_SIZE + il1 * VECTOR_INDEX_SIZE;
  const viOffset = HEADER_INFO_LENGTH + idx;
  sPtr = readUint32LE(cBuffer, viOffset);
  ePtr = readUint32LE(cBuffer, viOffset + 4);

  if (sPtr === 0 || ePtr === 0) return '';

  let dLen = 0, dPtr = 0, l = 0, h = Math.floor((ePtr - sPtr) / indexSize);
  while (l <= h) {
    const m = (l + h) >> 1;
    const p = sPtr + m * indexSize;
    if (compare(ipBytes, cBuffer, p) < 0) {
      h = m - 1;
    } else if (compare(ipBytes, cBuffer, p + bytes) > 0) {
      l = m + 1;
    } else {
      dLen = readUint16LE(cBuffer, p + dBytes);
      dPtr = readUint32LE(cBuffer, p + dBytes + 2);
      break;
    }
  }

  if (dLen === 0) return '';

  return new TextDecoder().decode(cBuffer.slice(dPtr, dPtr + dLen));
}

function parseRegion(regionStr) {
  if (!regionStr) return null;
  const parts = regionStr.split('|');
  return {
    country: parts[0] || '',
    province: parts[1] || '',
    city: parts[2] || '',
    isp: parts[3] || '',
    code: parts[4] || '',
  };
}

function formatLocation(region) {
  if (!region) return '';
  const isChinese = /[\u4e00-\u9fff]/.test(region.province) || /[\u4e00-\u9fff]/.test(region.city);
  let province = region.province;
  let city = region.city;
  if (isChinese) {
    province = province
      .replace(/^中华人民共和国/, '').replace(/^中国/, '')
      .replace(/壮族自治区$/, '').replace(/维吾尔自治区$/, '')
      .replace(/回族自治区$/, '').replace(/自治区$/, '')
      .replace(/特别行政区$/, '')
      .replace(/省$/, '').replace(/市$/, '').trim();
    city = city.replace(/^中国/, '').replace(/市$/, '').trim();
  }
  return [province, city].filter(Boolean).join(' ') || region.country || '';
}

let v4Cache = null;
let v6Cache = null;
let loadingPromise = null;

async function loadDBs(bucket) {
  if (v4Cache && v6Cache) return;

  if (loadingPromise) {
    await loadingPromise;
    return;
  }

  loadingPromise = (async () => {
    try {
      if (!v4Cache) {
        const v4Obj = await bucket.get('ip2region_v4.xdb');
        if (v4Obj) {
          const ab = await v4Obj.arrayBuffer();
          v4Cache = new Uint8Array(ab);
          console.log(`IPv4 xdb loaded from R2: ${(v4Cache.length / 1024 / 1024).toFixed(2)} MB`);
        } else {
          console.error('ip2region_v4.xdb not found in R2');
        }
      }
      if (!v6Cache) {
        const v6Obj = await bucket.get('ip2region_v6.xdb');
        if (v6Obj) {
          const ab = await v6Obj.arrayBuffer();
          v6Cache = new Uint8Array(ab);
          console.log(`IPv6 xdb loaded from R2: ${(v6Cache.length / 1024 / 1024).toFixed(2)} MB`);
        } else {
          console.error('ip2region_v6.xdb not found in R2');
        }
      }
    } finally {
      loadingPromise = null;
    }
  })();

  await loadingPromise;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const bucket = env.DB_BUCKET;
    const authToken = env.AUTH_TOKEN || '';

    if (url.pathname === '/' || url.pathname === '') {
      return jsonResponse({
        service: 'ip2region-api',
        usage: '/api/lookup?ip=8.8.8.8',
        ipv4: v4Cache !== null,
        ipv6: v6Cache !== null,
      });
    }

    if (url.pathname === '/api/health') {
      await loadDBs(bucket);
      return jsonResponse({
        status: 'ok',
        ipv4: v4Cache !== null,
        ipv6: v6Cache !== null,
      });
    }

    if (url.pathname === '/api/lookup') {
      if (authToken) {
        const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
          || url.searchParams.get('token') || '';
        if (token !== authToken) {
          return jsonResponse({ error: 'UNAUTHORIZED' }, 401);
        }
      }

      const ip = (url.searchParams.get('ip') || '').trim();
      if (!ip) {
        return jsonResponse({
          error: 'MISSING_IP',
          message: '请提供 ip 参数，例如 /api/lookup?ip=8.8.8.8',
        }, 400);
      }

      const version = detectIPVersion(ip);
      if (version === 0) {
        return jsonResponse({ error: 'INVALID_IP', message: `无效的 IP 地址: ${ip}` }, 400);
      }

      await loadDBs(bucket);

      const cBuffer = version === 6 ? v6Cache : v4Cache;
      if (!cBuffer) {
        return jsonResponse({
          error: 'SERVICE_UNAVAILABLE',
          message: `IPv${version} 查询未初始化`,
        }, 503);
      }

      try {
        const { bytes } = parseIP(ip);
        const regionStr = search(cBuffer, bytes, version);
        const region = parseRegion(regionStr);

        return jsonResponse({
          ip,
          version,
          region,
          location: formatLocation(region),
          raw: regionStr,
        });
      } catch (e) {
        return jsonResponse({ error: 'LOOKUP_FAILED', message: e.message }, 500);
      }
    }

    return jsonResponse({ error: 'NOT_FOUND' }, 404);
  },
};
