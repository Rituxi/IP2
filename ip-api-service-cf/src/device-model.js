import apple from './device-models/apple.json' with { type: 'json' };
import android from './device-models/android.json' with { type: 'json' };
import { jsonResponse } from './response.js';

const HIT_CACHE_CONTROL = 'public, max-age=86400';
const MISS_CACHE_CONTROL = 'public, max-age=300';

function normalize(value) {
  return value.trim().toLowerCase();
}

function buildIndex(sources) {
  const index = new Map();
  for (const { devices } of sources) {
    for (const [brands, displayName, ...models] of devices) {
      for (const brand of brands) {
        const brandKey = normalize(brand);
        if (!index.has(brandKey)) index.set(brandKey, new Map());
        const names = index.get(brandKey);
        for (const model of models) {
          const key = normalize(model);
          if (!names.has(key)) names.set(key, displayName);
          else if (names.get(key) !== displayName) names.set(key, null);
        }
      }
    }
  }
  return index;
}

const modelsByBrand = buildIndex([apple, ...android]);

export function lookupDeviceModel(params) {
  const brands = params.getAll('brand');
  const models = params.getAll('model');
  const brand = normalize(brands[0] ?? '');
  const model = normalize(models[0] ?? '');

  if (brands.length !== 1 || models.length !== 1 || !brand || !model) {
    return jsonResponse({ ok: false, matched: false, displayName: null, error: 'invalid_parameters' }, 'no-store', {
      status: 400,
    });
  }

  const displayName = modelsByBrand.get(brand)?.get(model) ?? null;
  const matched = displayName !== null;
  return jsonResponse({ ok: true, matched, displayName }, matched ? HIT_CACHE_CONTROL : MISS_CACHE_CONTROL);
}
