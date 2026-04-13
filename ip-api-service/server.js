import express from 'express';
import { IPv4, IPv6, loadContentFromFile, newWithBuffer, parseIP } from 'ip2region.js';
import { isIP } from 'node:net';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

let v4Searcher = null;
let v6Searcher = null;

function initSearchers() {
  const v4DbPath = process.env.IP2REGION_V4_DB || './data/ip2region_v4.xdb';
  const v6DbPath = process.env.IP2REGION_V6_DB || './data/ip2region_v6.xdb';

  try {
    const v4Buffer = loadContentFromFile(v4DbPath);
    v4Searcher = newWithBuffer(IPv4, v4Buffer);
    console.log(`IPv4 xdb loaded: ${(v4Buffer.length / 1024 / 1024).toFixed(2)} MB`);
  } catch (e) {
    console.error('Failed to load IPv4 xdb:', e.message);
  }

  try {
    const v6Buffer = loadContentFromFile(v6DbPath);
    v6Searcher = newWithBuffer(IPv6, v6Buffer);
    console.log(`IPv6 xdb loaded: ${(v6Buffer.length / 1024 / 1024).toFixed(2)} MB`);
  } catch (e) {
    console.error('Failed to load IPv6 xdb:', e.message);
  }
}

function detectIpVersion(ip) {
  const version = isIP(ip);
  if (version === 4) return 4;
  if (version === 6) return 6;
  return 0;
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
      .replace(/^中华人民共和国/, '')
      .replace(/^中国/, '')
      .replace(/壮族自治区$/, '')
      .replace(/维吾尔自治区$/, '')
      .replace(/回族自治区$/, '')
      .replace(/自治区$/, '')
      .replace(/特别行政区$/, '')
      .replace(/省$/, '')
      .replace(/市$/, '')
      .trim();
    city = city.replace(/^中国/, '').replace(/市$/, '').trim();
  }

  return [province, city].filter(Boolean).join(' ') || region.country || '';
}

function checkAuth(req) {
  if (!AUTH_TOKEN) return true;
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.query.token || '';
  return token === AUTH_TOKEN;
}

app.get('/api/lookup', async (req, res) => {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const ip = String(req.query.ip || '').trim();

  if (!ip) {
    return res.status(400).json({ error: 'MISSING_IP', message: '请提供 ip 参数，例如 /api/lookup?ip=8.8.8.8' });
  }

  const version = detectIpVersion(ip);
  if (version === 0) {
    return res.status(400).json({ error: 'INVALID_IP', message: `无效的 IP 地址: ${ip}` });
  }

  const searcher = version === 6 ? v6Searcher : v4Searcher;
  if (!searcher) {
    return res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: `IPv${version} 查询未初始化` });
  }

  try {
    const regionStr = await searcher.search(ip);
    const region = parseRegion(regionStr);

    res.json({
      ip,
      version,
      region,
      location: formatLocation(region),
      raw: regionStr,
    });
  } catch (e) {
    res.status(500).json({ error: 'LOOKUP_FAILED', message: e.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    ipv4: v4Searcher !== null,
    ipv6: v6Searcher !== null,
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'ip2region-api',
    usage: '/api/lookup?ip=8.8.8.8',
    ipv4: v4Searcher !== null,
    ipv6: v6Searcher !== null,
  });
});

initSearchers();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`IP2Region API running on http://localhost:${PORT}`);
});
