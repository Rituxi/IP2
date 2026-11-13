import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  CATALOG_KEY, CATALOG_LICENSE, CATALOG_SCHEMA_VERSION, CATALOG_SOURCE, SUB_BRAND_PARENTS, normalizeModelKey, readCatalog,
} from '../src/device-catalog.js';

const COMMIT_URL = `https://api.github.com/repos/${CATALOG_SOURCE}/commits?sha=main&path=models.csv&per_page=1`;
const LICENSE_URL = `https://api.github.com/repos/${CATALOG_SOURCE}/contents/LICENSE?ref=`;
const REVIEWED_LICENSE_BLOB = 'bfef380bf7d9cb74ec9ba533b37c3fbeef3bdc09';
const CSV_COLUMNS = ['model', 'dtype', 'brand', 'brand_title', 'code_alias', 'model_name', 'ver_name', 'source_file'];
const MIN_PHONE_ROWS = 5_000;
const MIN_MATCHES = 3_000;
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const PRODUCT_VARIANT = /^(5G S|5G|Pro\+?|Plus|Ultra|Max|Sport|Power|至尊版)(?=\s|$)/i;
const AMBIGUOUS_MODELS = [
  ['huawei', 'mna-al00'], // Huawei lists both P60 Art and P60 Pro.
  ['xiaomi', '25113pn0eg'], // Xiaomi's Chile listing gives the code two names.
  ['motorola', 'xt2153-1'], // Motorola's DoC gives a different name from the CSV.
];

function productName(brand, name, variant, hardwareId) {
  if (brand === 'apple') {
    if (name === 'iPhone SE' && hardwareId === 'iPhone8,4') return 'iPhone SE (1st generation)';
    return name.replace(/\(第 ([123]) 代\)/, (_, generation) =>
      `(${['1st', '2nd', '3rd'][Number(generation) - 1]} generation)`);
  }
  if (brand === 'oneplus') name = name.replace(/^一加 /, 'OnePlus ');
  if (brand === 'vivo' && !/^(?:vivo|iqoo)\b/i.test(name)) name = `vivo ${name}`;
  // The CSV can put part of a product name before the regional details in ver_name.
  const suffix = PRODUCT_VARIANT.exec(variant)?.[1];
  if (suffix === '至尊版') return name.endsWith(suffix) ? name : `${name}${suffix}`;
  if (suffix && !name.toLowerCase().endsWith(` ${suffix.toLowerCase()}`)) return `${name} ${suffix}`;
  return name;
}

function equivalentName(brand, name) {
  const key = name.toLowerCase();
  // Compare explicit bilingual naming conventions while retaining the name supplied by the CSV.
  if (brand === 'xiaomi') {
    return key.replace(/^(?:小米|mi|xiaomi) /, 'xiaomi ')
      .replace(/^红米 /, 'redmi ')
      .replace(/^(redmi k\d+) ?至尊版$/, '$1 ultra');
  }
  if (brand === 'meizu') return key.replace(/^魅族 /, 'meizu ');
  if (brand === 'blackshark') return key.replace(/^(?:腾讯)?黑鲨(?:游戏手机)?(?= |$)/, 'black shark');
  return key;
}

function addCandidate(entries, model, candidate) {
  if (!Object.hasOwn(entries, model)) {
    entries[model] = candidate;
    return;
  }
  const previous = entries[model];
  if (previous?.key !== candidate?.key) entries[model] = null;
  else if (candidate?.english && !previous.english) entries[model] = candidate;
}

export function buildCatalog(csv, revision, updatedAt) {
  const rows = parse(csv, {
    bom: true,
    skip_empty_lines: true,
    columns(headers) {
      if (new Set(headers).size !== headers.length || CSV_COLUMNS.some((name) => !headers.includes(name))) {
        throw new Error('Unexpected MobileModels CSV columns');
      }
      return headers;
    },
  });
  const byBrand = Object.create(null);
  const brandTitles = new Map();
  const subBrands = new Map();
  let phoneRows = 0;
  for (const row of rows) {
    if (row.dtype.trim() !== 'mob') continue;
    phoneRows++;
    const brand = normalizeModelKey(row.brand);
    const brandTitle = normalizeModelKey(row.brand_title);
    const model = normalizeModelKey(row.model);
    const name = row.model_name.trim().replace(/\s+/g, ' ');
    const source = row.source_file.trim();
    if (!brand || !brandTitle || !model || !name || !source) {
      throw new Error('MobileModels phone row is missing a required field');
    }

    const hardwareId = row.code_alias.trim();
    const displayName = productName(brand, name, row.ver_name.trim(), hardwareId);
    const candidate = { displayName, key: equivalentName(brand, displayName), english: source.endsWith('_en') };
    const models = [model];
    if (brand === 'apple' && /^iPhone\d+,\d+$/i.test(hardwareId)) models.push(normalizeModelKey(hardwareId));

    const names = byBrand[brand] ??= Object.create(null);
    for (const key of models) addCandidate(names, key, candidate);
    for (const alias of [brand, brandTitle]) {
      if (!brandTitles.has(alias)) brandTitles.set(alias, new Set());
      brandTitles.get(alias).add(brand);
    }

    const subBrand = /^(iqoo|redmi|poco)\b/.exec(candidate.key)?.[1];
    if (SUB_BRAND_PARENTS.get(subBrand) === brand) {
      if (!subBrands.has(subBrand)) subBrands.set(subBrand, new Map());
      subBrands.get(subBrand).set(model, brand);
    }
  }

  for (const [brand, model] of AMBIGUOUS_MODELS) {
    if (byBrand[brand]) byBrand[brand][model] = null;
  }

  // All names for a brand are resolved before expanding its titles and sub-brands.
  const brands = Object.create(null);
  for (const [alias, brandKeys] of brandTitles) {
    const entries = brands[alias] = Object.create(null);
    for (const brand of brandKeys) {
      for (const [model, candidate] of Object.entries(byBrand[brand])) addCandidate(entries, model, candidate);
    }
  }
  for (const [alias, models] of subBrands) {
    const entries = brands[alias] ??= Object.create(null);
    for (const [model, brand] of models) addCandidate(entries, model, byBrand[brand][model]);
  }
  for (const entries of Object.values(brands)) {
    for (const [model, candidate] of Object.entries(entries)) entries[model] = candidate?.displayName ?? null;
  }

  return readCatalog({
    schemaVersion: CATALOG_SCHEMA_VERSION,
    source: { repository: CATALOG_SOURCE, revision, license: CATALOG_LICENSE },
    updatedAt,
    phoneRows,
    modelCount: Object.values(byBrand).reduce((total, entries) => total + Object.values(entries).filter(Boolean).length, 0),
    brands,
  });
}

function validateCandidate(candidate, previous) {
  const minRows = Math.max(MIN_PHONE_ROWS, Math.floor((previous?.phoneRows ?? 0) * 0.8));
  const minModels = Math.max(MIN_MATCHES, Math.floor((previous?.modelCount ?? 0) * 0.8));
  if (candidate.phoneRows < minRows || candidate.modelCount < minModels) {
    throw new Error(`MobileModels coverage dropped to ${candidate.phoneRows} rows and ${candidate.modelCount} unique matches (expected at least ${minRows} rows and ${minModels} matches)`);
  }
}

async function checkedFetch(fetcher, url, operation, options = {}) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(30_000), ...options });
  if (!response.ok) throw new Error(`${operation} failed (HTTP ${response.status})`);
  return response;
}

async function verifyLicense(fetcher, ref) {
  const response = await checkedFetch(fetcher, LICENSE_URL + ref, 'Checking MobileModels license');
  const license = await response.json();
  if (license.sha !== REVIEWED_LICENSE_BLOB) throw new Error(`MobileModels license changed at ${ref}; review it before updating`);
}

export async function syncCatalog({ store, rebuild = false, fetcher = fetch, now = () => new Date() } = {}) {
  const previous = await store?.read();
  const [commitResponse] = await Promise.all([
    checkedFetch(fetcher, COMMIT_URL, 'Checking MobileModels version'),
    verifyLicense(fetcher, 'main'),
  ]);
  const commits = await commitResponse.json();
  const revision = commits?.[0]?.sha;
  if (typeof revision !== 'string' || !/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error('MobileModels returned an invalid commit SHA');
  }
  if (previous?.source.revision === revision && !rebuild) return { updated: false, catalog: previous };

  await verifyLicense(fetcher, revision);
  const csvUrl = `https://raw.githubusercontent.com/${CATALOG_SOURCE}/${revision}/models.csv`;
  const csvResponse = await checkedFetch(fetcher, csvUrl, 'Downloading MobileModels CSV');
  const bytes = await csvResponse.arrayBuffer();
  if (bytes.byteLength > MAX_CSV_BYTES) throw new Error('MobileModels CSV exceeds the size limit');
  const csv = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const catalog = buildCatalog(csv, revision, now().toISOString());
  validateCandidate(catalog, previous);
  await store?.write(catalog);
  return { updated: true, catalog };
}

export function r2CatalogStore(accountId, token, fetcher = fetch) {
  if (!/^[a-f0-9]{32}$/.test(accountId ?? '') || !token) {
    throw new Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN for publishing');
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/ip2region-db/objects/${CATALOG_KEY}`;
  const headers = { Authorization: `Bearer ${token}` };
  return {
    async read() {
      const response = await fetcher(url, { headers, signal: AbortSignal.timeout(30_000) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Reading R2 catalog failed (HTTP ${response.status})`);
      const body = await response.text();
      try {
        return readCatalog(JSON.parse(body));
      } catch (error) {
        console.warn('Rebuilding invalid R2 catalog:', error.message);
        return null;
      }
    },
    async write(catalog) {
      const response = await checkedFetch(fetcher, url, 'Publishing R2 catalog', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(catalog),
      });
      if ((await response.json()).success !== true) throw new Error('Cloudflare did not confirm the R2 upload');
    },
  };
}

async function main([mode, output]) {
  let store;
  if (mode === '--publish' && process.env.MOBILEMODELS_PRODUCTION_ENABLED === 'true') {
    store = r2CatalogStore(process.env.CLOUDFLARE_ACCOUNT_ID, process.env.CLOUDFLARE_API_TOKEN);
  } else if (mode !== '--validate') {
    throw new Error('Use --validate [output.json], or enable MOBILEMODELS_PRODUCTION_ENABLED before --publish');
  }
  const { updated, catalog } = await syncCatalog({
    store,
    rebuild: mode === '--publish' && output === '--rebuild',
  });
  if (mode === '--validate' && output) await writeFile(output, JSON.stringify(catalog), 'utf8');
  const action = mode === '--validate' ? 'Validated' : updated ? 'Published' : 'Unchanged';
  const timestampLabel = mode === '--validate' ? 'validatedAt' : 'lastPublishedAt';
  console.log(`${action} ${catalog.source.revision}, ${catalog.phoneRows} phone rows, ${catalog.modelCount} unique matches, ${timestampLabel}=${catalog.updatedAt}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
