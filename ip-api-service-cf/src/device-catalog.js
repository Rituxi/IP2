export const CATALOG_KEY = 'device-models/mobilemodels.json';
export const CATALOG_SCHEMA_VERSION = 1;
export const CATALOG_SOURCE = 'KHwang9883/MobileModels-csv';
export const CATALOG_LICENSE = 'CC-BY-NC-SA-4.0';
export const SUB_BRAND_PARENTS = new Map([['iqoo', 'vivo'], ['poco', 'xiaomi'], ['redmi', 'xiaomi']]);

export function normalizeModelKey(value) {
  return value.trim().toLowerCase();
}

export function readCatalog(data) {
  if (data?.schemaVersion !== CATALOG_SCHEMA_VERSION || data.source?.repository !== CATALOG_SOURCE
      || data.source.license !== CATALOG_LICENSE || !/^[a-f0-9]{40}$/.test(data.source.revision ?? '')
      || typeof data.updatedAt !== 'string' || !Number.isFinite(Date.parse(data.updatedAt))
      || !Number.isInteger(data.phoneRows) || data.phoneRows < 1
      || !Number.isInteger(data.modelCount) || data.modelCount < 1
      || !data.brands || typeof data.brands !== 'object' || Array.isArray(data.brands)
      || !Object.keys(data.brands).length) {
    throw new Error('Invalid device catalog');
  }
  for (const entries of Object.values(data.brands)) {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)
        || !Object.values(entries).every((name) => name === null || (typeof name === 'string' && name.length > 0))) {
      throw new Error('Invalid device catalog entries');
    }
  }
  return data;
}
