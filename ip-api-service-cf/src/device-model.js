import apple from './device-models/apple.json' with { type: 'json' };
import android from './device-models/android.json' with { type: 'json' };
import { CATALOG_KEY, CATALOG_SOURCE, SUB_BRAND_PARENTS, normalizeModelKey, readCatalog } from './device-catalog.js';
import { jsonResponse } from './response.js';

const HIT_CACHE_CONTROL = 'public, max-age=86400';
const MISS_CACHE_CONTROL = 'public, max-age=300';
const REFRESH_MS = 5 * 60_000;
const RETRY_MS = 30_000;

function buildIndex(sources) {
  const index = new Map();
  for (const { devices } of sources) {
    for (const [brands, displayName, ...models] of devices) {
      for (const brand of brands) {
        const brandKey = normalizeModelKey(brand);
        if (!index.has(brandKey)) index.set(brandKey, new Map());
        const names = index.get(brandKey);
        for (const model of models) {
          const key = normalizeModelKey(model);
          if (!names.has(key)) names.set(key, displayName);
          else if (names.get(key) !== displayName) names.set(key, null);
        }
      }
    }
  }
  return index;
}

const modelsByBrand = buildIndex([apple, ...android]);

let catalogCache = { catalog: null, etag: undefined, uploadedAt: 0, expiresAt: 0, checkAfter: 0 };

async function loadCatalog(bucket) {
  const previous = catalogCache;
  if (Date.now() < previous.checkAfter) return previous;

  try {
    const object = await bucket.get(CATALOG_KEY, previous.etag ? { onlyIf: { etagDoesNotMatch: previous.etag } } : undefined);
    if (!object) throw new Error('Device catalog is missing from R2');
    const catalog = 'body' in object ? readCatalog(await object.json()) : previous.catalog;
    if (!catalog) throw new Error('Device catalog has no usable body');
    // Concurrent requests can finish in a different order. Keep the newest completed read.
    const uploadedAt = object.uploaded.getTime();
    if (uploadedAt >= catalogCache.uploadedAt) {
      const expiresAt = Date.now() + REFRESH_MS;
      catalogCache = { catalog, etag: object.etag, uploadedAt, expiresAt, checkAfter: expiresAt };
    }
  } catch (error) {
    console.warn('Unable to refresh device catalog:', error.message);
    if (catalogCache === previous) catalogCache = { ...previous, checkAfter: Date.now() + RETRY_MS };
  }
  return catalogCache;
}

export async function lookupDeviceModel(params, env) {
  const brands = params.getAll('brand');
  const models = params.getAll('model');
  const brand = normalizeModelKey(brands[0] ?? '');
  const model = normalizeModelKey(models[0] ?? '');

  if (brands.length !== 1 || models.length !== 1 || !brand || !model) {
    return jsonResponse({ ok: false, matched: false, displayName: null, error: 'invalid_parameters' }, 'no-store', {
      status: 400,
    });
  }

  const bundledName = modelsByBrand.get(brand)?.get(model) ?? null;
  const enabled = env.MOBILEMODELS_ENABLED === 'true';
  let displayName = bundledName;
  let cacheControl = displayName === null ? MISS_CACHE_CONTROL : HIT_CACHE_CONTROL;
  const headers = {};
  if (enabled) {
    const { catalog, expiresAt } = await loadCatalog(env.DB_BUCKET);
    if (!catalog) {
      return jsonResponse({ ok: false, matched: false, displayName: null, error: 'catalog_unavailable' }, 'no-store', {
        status: 503,
      });
    }
    const entries = Object.hasOwn(catalog.brands, brand) ? catalog.brands[brand] : null;
    const parentEntries = catalog.brands[SUB_BRAND_PARENTS.get(brand)];
    // An explicit null is ambiguous. A parent-brand entry can also rule out a bundled sub-brand match.
    if (entries && Object.hasOwn(entries, model)) {
      displayName = entries[model];
      headers.Link = `<https://github.com/${CATALOG_SOURCE}/blob/${catalog.source.revision}/models.csv>; rel="via"; title="MobileModels by KHwang9883 (adapted)", <https://creativecommons.org/licenses/by-nc-sa/4.0/>; rel="license"`;
    } else if (parentEntries && Object.hasOwn(parentEntries, model)) {
      displayName = null;
    }
    const maxAge = Math.floor((expiresAt - Date.now()) / 1000);
    cacheControl = maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store';
  }
  const matched = displayName !== null;
  return jsonResponse({ ok: true, matched, displayName }, cacheControl, { headers });
}
