import { lookupDeviceModel } from './device-model.js';
import { ipStatus, lookupIp } from './ip-lookup.js';
import { jsonResponse } from './response.js';
import { getTime } from './time.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/time' || url.pathname === '/api/device-model') {
      if (request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'method_not_allowed' }, 'no-store', {
          status: 405,
          headers: { Allow: 'GET' },
        });
      }

      return url.pathname === '/api/time' ? getTime() : lookupDeviceModel(url.searchParams, env);
    }

    if (url.pathname === '/' || url.pathname === '/api/health') {
      return ipStatus(env.DB_BUCKET, url.pathname === '/');
    }

    if (url.pathname === '/api/lookup') {
      return lookupIp(request, url, env);
    }

    return jsonResponse({ 错误: '未找到', 说明: '请求的路径不存在' }, 'public, max-age=3600', { status: 404 });
  },
};
