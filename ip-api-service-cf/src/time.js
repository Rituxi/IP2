import { jsonResponse } from './response.js';

const taipeiDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getTime() {
  const unixMs = Date.now();
  const parts = Object.fromEntries(taipeiDate.formatToParts(unixMs).map(({ type, value }) => [type, value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return jsonResponse({ ok: true, unixMs, date }, 'no-store');
}
