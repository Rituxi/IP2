import { readFile, writeFile } from 'node:fs/promises';

const output = new URL('../src/device-models/apple.json', import.meta.url);
const revision = process.argv[2] ?? JSON.parse(await readFile(output, 'utf8')).revision;

if (!/^[a-f0-9]{40}$/.test(revision)) {
  throw new Error('Provide a full AppleDB gh-pages commit SHA.');
}

const source = `https://raw.githubusercontent.com/littlebyteorg/appledb/${revision}`;

async function readUpstream(path) {
  const response = await fetch(`${source}/${path}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`AppleDB ${path}: HTTP ${response.status}`);
  return response.json();
}

const [upstreamDevices, upstreamGroups] = await Promise.all([
  readUpstream('device/main.json'),
  readUpstream('group/main.json'),
]);
const groups = upstreamGroups.filter(({ type }) => type === 'iPhone');
const phones = upstreamDevices.filter(({ type }) => type === 'iPhone');
const groupsByDevice = new Map();
for (const group of groups.flatMap((item) => item.subgroups ?? [item])) {
  for (const key of group.devices) {
    if (!groupsByDevice.has(key)) groupsByDevice.set(key, []);
    groupsByDevice.get(key).push(group);
  }
}

if (!phones.length || phones.some(({ key }) => !groupsByDevice.has(key))) {
  throw new Error('AppleDB iPhone records and product groups no longer align. Review the sources before updating.');
}

const devices = [];
for (const { key, name, identifier = [], model = [] } of phones) {
  const models = [...new Set([
    ...identifier.filter((value) => /^iPhone\d+,\d+$/.test(value)),
    ...model.filter((value) => /^A\d{4}$/.test(value)),
  ])].sort();
  for (const group of groupsByDevice.get(key)) {
    // Use the shared product name for grouped variants and the device name for standalone models.
    const displayName = group.devices.length > 1 ? group.name : name;
    if (models.length) devices.push([['Apple'], displayName, ...models]);
  }
}

// Preserve multiple candidates for a code so that the Worker can reject ambiguous queries.
const rows = [...new Set(devices.map((row) => JSON.stringify(row)))].sort();
const data = [
  '{',
  `  "revision": ${JSON.stringify(revision)},`,
  `  "source": ${JSON.stringify(source)},`,
  '  "license": "MIT",',
  '  "devices": [',
  rows.map((row) => `    ${row}`).join(',\n'),
  '  ]',
  '}',
  '',
].join('\n');
await writeFile(output, data, 'utf8');
console.log(`Wrote ${rows.length} AppleDB iPhone rows from ${revision}`);
