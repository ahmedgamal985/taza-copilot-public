// Client for the AAI API (https://backend.air.org.kz/docs). The key stays on the server.
// Every response is cached and refreshed in the background (warm), so questions never wait for
// the API and the 100 requests/minute limit is never reached.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://backend.air.org.kz';
// The cache is saved to disk, so a restarted server answers instantly with the last data
// (marked stale, so it is refreshed in the background right away)
const CACHE_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'aai-cache.json');
const cache = new Map();
try {
  if (existsSync(CACHE_FILE)) for (const [k, v] of Object.entries(JSON.parse(readFileSync(CACHE_FILE, 'utf8')))) cache.set(k, { at: 0, data: v.data });
} catch {}
let saveTimer = null;
const saveSoon = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { mkdirSync(dirname(CACHE_FILE), { recursive: true }); writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries([...cache].filter(([k]) => !k.includes('/locations/'))))); } catch {}
  }, 5000);
  saveTimer.unref?.();
};

export const hasAaiKey = () => Boolean(process.env.AAI_API_KEY);

// The AAI API is usually fast (~0.3 s) but sometimes slow: allow 20 s and retry once
async function fetchJson(path, attempt = 1) {
  try {
    const res = await fetch(BASE + path, {
      headers: { 'X-API-Key': process.env.AAI_API_KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`AAI API ${path} returned ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt < 2) { await new Promise(r => setTimeout(r, 1500)); return fetchJson(path, attempt + 1); }
    throw err;
  }
}

// Stale-while-revalidate: once something is cached, callers always get it instantly; when it is
// older than its TTL a single background refresh updates it. Only the very first call waits.
const inflight = new Map();
function refresh(path) {
  if (!inflight.has(path)) {
    inflight.set(path, fetchJson(path)
      .then(data => { cache.set(path, { at: Date.now(), data }); saveSoon(); return data; })
      .finally(() => inflight.delete(path)));
  }
  return inflight.get(path);
}
async function get(path, ttlSeconds = 300) {
  if (!hasAaiKey()) throw new Error('AAI_API_KEY is not set');
  const hit = cache.get(path);
  if (hit) {
    if (Date.now() - hit.at >= ttlSeconds * 1000) refresh(path).catch(() => {});
    return hit.data;
  }
  return refresh(path);
}

const thisYear = () => new Date().getUTCFullYear();
const PATHS = {
  map: '/v1/measurements/map?city=almaty',
  districts: '/v1/measurements/districts?lang=en',
  hours: '/v1/measurements/week-hours?city=almaty&days=14', // 30 days times out at the API
  compare: '/v1/measurements/comparison?city=almaty',
  gases: '/v1/eco-se/current',
  pollen: '/v1/pollen/misery',
  cities: '/v1/asia/current',
  pm25Year: y => `/v1/pm25/calendar?year=${y}&city_wide=true`,
  no2Year: y => `/v1/no2/calendar?year=${y}&city_wide=true`,
};

// Fetch everything in the background so answers never wait on the AAI API
export async function warm() {
  if (!hasAaiKey()) return;
  const y = thisYear();
  const jobs = [[PATHS.map, 300], [PATHS.districts, 300], [PATHS.compare, 300], [PATHS.gases, 600], [PATHS.pollen, 1800],
    [PATHS.cities, 900], [PATHS.hours, 3600], [PATHS.pm25Year(y), 3600], [PATHS.pm25Year(y - 1), 86400],
    [PATHS.no2Year(y), 3600], [PATHS.no2Year(y - 1), 86400], ['/v1/measurements/current-week-hours?city=almaty', 300]];
  await Promise.allSettled(jobs.map(([p, ttl]) => get(p, ttl * 0.8)));
  // Compare mode: district calendars (this year and last) and other cities, four at a time, so a
  // comparison opens instantly even when the AAI API is slow
  const more = [...DISTRICTS.flatMap(district => [{ district, year: y }, { district, year: y - 1 }]),
    ...Object.keys(CITIES).map(city => ({ city, year: y }))];
  // (not awaited: nothing at startup waits for it; duplicate requests are merged by refresh)
  (async () => { for (let i = 0; i < more.length; i += 4) await Promise.allSettled(more.slice(i, i + 4).map(daily)); })().catch(() => {});
}

// PM2.5 (µg/m³) to a category, using the same scale as AAI's own dashboard:
// adapted from the WHO 2021 daily guideline (15) and Kazakhstan's daily limit (35).
export function pm25Category(v) {
  if (v == null || Number.isNaN(v)) return { key: 'unknown', label: 'No data' };
  if (v <= 15) return { key: 'good', label: 'Good' };
  if (v <= 35) return { key: 'moderate', label: 'Moderate' };
  if (v <= 70) return { key: 'sensitive', label: 'Unhealthy for sensitive groups' };
  if (v <= 140) return { key: 'unhealthy', label: 'Unhealthy' };
  return { key: 'very', label: 'Very unhealthy' };
}

const r1 = v => Math.round(v * 10) / 10;
const mean = xs => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Stations with their recent PM2.5 average, for the map.
export async function getStations() {
  const map = await get(PATHS.map);
  const stations = (map.data || [])
    .filter(s => s.latitude != null && s.longitude != null && s.pm25_avg != null)
    .map(s => ({
      id: s.location_id, name: s.location_name, lat: s.latitude, lng: s.longitude,
      pm25: r1(s.pm25_avg), aqi: s.aqi, last: s.last_measurement, category: pm25Category(s.pm25_avg).key,
    }));
  return { stations, meta: map.meta };
}

const LIVE = 'https://air.org.kz/en/';

// Health advice by category, in the spirit of AAI's dashboard
export const ADVICE = {
  good: ['Great time to be outdoors', 'Open the windows and air the rooms'],
  moderate: ['Safe for healthy people, walks are possible', 'Sensitive people: keep long outdoor exercise short'],
  sensitive: ['Better to stay indoors', 'Use a mask outdoors', 'Children, elderly and people with asthma should limit time outside'],
  unhealthy: ['Avoid outdoor walks', 'Use a mask outdoors', 'Close windows'],
  very: ['Stay indoors', 'Use an air purifier if you have one', 'Use a mask (N95/FFP2) if you must go out', 'Close windows'],
};

// One sensor in detail: current value, change over 24 hours, hourly series, min/avg/max, advice
export async function getStationDetail(id) {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Bad station id');
  // The card never waits more than 4 s for the AAI API: if the 24-hour series is slow or fails, it opens
  // with the current reading from the map (the fetch keeps going and is cached for the next time)
  const series24 = get(`/v1/measurements/locations/${id}?hours=24`, 300);
  series24.catch(() => {});
  const [{ stations }, raw] = await Promise.all([getStations(),
    Promise.race([series24, new Promise(r => setTimeout(() => r(null), 4000))]).catch(() => null)]);
  const meta = stations.find(s => s.id === id);
  const rows = (Array.isArray(raw) ? raw : raw?.data || []).filter(r => r.pm02 != null && r.measured_at)
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  if (!rows.length && !meta) throw new Error('No data for this sensor');
  // Hourly averages in Almaty local time (UTC+5)
  const hours = new Map();
  for (const r of rows) {
    const local = new Date(new Date(r.measured_at).getTime() + 5 * 3600_000);
    const key = local.toISOString().slice(0, 13);
    hours.set(key, [...(hours.get(key) || []), r.pm02]);
  }
  const series = [...hours.entries()].map(([k, vs]) => ({ t: `${k.slice(11, 13)}:00`, v: r1(mean(vs)) }));
  const vals = series.map(s => s.v);
  const latest = rows[rows.length - 1];
  const current = meta?.pm25 ?? (latest ? r1(latest.pm02) : null);
  const cat = pm25Category(current);
  return {
    id, name: meta?.name || `Sensor ${id}`, lat: meta?.lat, lng: meta?.lng,
    pm25: current, category: cat.key, label: cat.label,
    updated: latest?.measured_at || meta?.last || null,
    change_24h: series.length > 1 ? Math.round(series[series.length - 1].v - series[0].v) : null,
    series,
    min: vals.length ? Math.round(Math.min(...vals)) : null,
    avg: vals.length ? Math.round(mean(vals)) : null,
    max: vals.length ? Math.round(Math.max(...vals)) : null,
    pm10: latest?.pm10 != null ? r1(latest.pm10) : null,
    temperature: latest?.atmp != null ? r1(latest.atmp) : null,
    humidity: latest?.rhum ?? null,
    advice: ADVICE[cat.key] || [],
    source: 'AAI sensor network (AirGradient)',
  };
}

// Daily calendar (PM2.5 or NO2) summarised for one year, plus any specific dates asked about
async function yearSummary(kind, year, dates) {
  const rows = (await get(kind === 'no2' ? PATHS.no2Year(year) : PATHS.pm25Year(year), year === thisYear() ? 3600 : 86400))
    .map(d => ({ date: d.date, v: d.avg_pm25 ?? d.avg_no2 ?? d.value })).filter(d => d.v != null);
  if (!rows.length) return null;
  const label = kind === 'no2' ? 'NO2' : 'PM2.5';
  const sorted = [...rows].sort((a, b) => b.v - a.v);
  const byMonth = new Map();
  for (const d of rows) { const m = +d.date.slice(5, 7) - 1; byMonth.set(m, [...(byMonth.get(m) || []), d.v]); }
  const blocks = [
    `${year} city-wide daily average ${label} in Almaty from AAI sensors: ${r1(mean(rows.map(d => d.v)))} µg/m³ on average over ${rows.length} days${year === thisYear() ? ' so far' : ''}.`,
    `Monthly averages of ${label} in ${year}: ${[...byMonth.entries()].map(([m, vs]) => `${MONTHS[m]} ${r1(mean(vs))}`).join(', ')} µg/m³.`,
    `Most polluted days of ${year} (${label}): ${sorted.slice(0, 3).map(d => `${d.date} ${r1(d.v)} µg/m³`).join('; ')}.`,
    `Cleanest days of ${year} (${label}): ${sorted.slice(-3).reverse().map(d => `${d.date} ${r1(d.v)} µg/m³`).join('; ')}.`,
  ];
  if (kind === 'pm25') {
    const good = rows.filter(d => d.v <= 15).length, bad = rows.filter(d => d.v > 35).length;
    blocks.push(`Days in ${year} by daily PM2.5: ${good} days at or below the WHO 24-hour guideline of 15 µg/m³, ` +
      `${rows.length - good - bad} days between 15 and 35 µg/m³, and ${bad} days above Kazakhstan's daily limit of 35 µg/m³ (${rows.length} days with data).`);
    if (year === thisYear()) {
      const last7 = [...rows].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
      blocks.push(`Average PM2.5 over the last 7 days with data (${last7[0].date} to ${last7[last7.length - 1].date}): ${r1(mean(last7.map(d => d.v)))} µg/m³.`);
    }
  }
  for (const date of dates.filter(d => d.startsWith(String(year)))) {
    const hit = rows.find(d => d.date === date);
    blocks.push(hit ? `On ${date} the city-wide daily average ${label} was ${r1(hit.v)} µg/m³.` : `No ${label} daily data is available for ${date}.`);
  }
  return { title: `AAI sensor archive, daily ${label} in Almaty, ${year}`, source: LIVE, blocks };
}

// Small text summaries of live and archive data that the AI can read and cite.
// A reading's time in Almaty (UTC+5), written out: the API mixes UTC ("…T20:47Z", which is already the next day in
// Almaty) and local times ("…T23:45+05:00"), and answers gave the UTC date ("6 November" at 01:47 on 7 November)
function almatyTime(ts) {
  const d = new Date(ts || NaN);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date(d.getTime() + 5 * 3600e3);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${a.getUTCDate()} ${months[a.getUTCMonth()]} ${a.getUTCFullYear()}, ${String(a.getUTCHours()).padStart(2, '0')}:${String(a.getUTCMinutes()).padStart(2, '0')} Almaty time`;
}

export async function liveContext(topics = [], { dates = [], years = [] } = {}) {
  const want = new Set(topics);
  const parts = [];
  const tasks = [];

  if (want.has('city')) tasks.push((async () => {
    const { stations, meta } = await getStations();
    const values = stations.map(s => s.pm25);
    const avg = mean(values);
    const counts = stations.reduce((m, s) => (m[s.category] = (m[s.category] || 0) + 1, m), {});
    const worst = [...stations].sort((a, b) => b.pm25 - a.pm25).slice(0, 5);
    const best = [...stations].sort((a, b) => a.pm25 - b.pm25).slice(0, 3);
    parts.push({ title: `AAI sensor network, live (updated ${almatyTime(meta?.generated_at) || 'recently'})`, source: LIVE, blocks: [
      `Live PM2.5 across Almaty from the ${stations.length} AAI sensors reporting right now (the number reporting changes; it is not the size of AAI's network): city average ${r1(avg)} µg/m³ (${pm25Category(avg).label}).`,
      `Sensors by category: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')}. The WHO 24-hour guideline for PM2.5 is 15 µg/m³.`,
      `Highest readings now: ${worst.map(s => `${s.name} ${s.pm25} µg/m³`).join('; ')}.`,
      `Lowest readings now: ${best.map(s => `${s.name} ${s.pm25} µg/m³`).join('; ')}.`,
    ] });
  })());

  if (want.has('districts')) tasks.push((async () => {
    const d = await get(PATHS.districts);
    const rows = d.districts || [];
    if (rows.length) parts.push({ title: `AAI sensor network, live averages by district (${almatyTime(d.timestamp) || 'now'})`, source: LIVE,
      blocks: [...rows].sort((a, b) => b.pm25_avg - a.pm25_avg).map(r =>
        `${r.district} district: PM2.5 ${r.pm25_avg} µg/m³, PM10 ${r.pm10_avg} µg/m³, AQI ${r.aqi_avg}, from ${r.stations_count} sensors.`) });
  })());

  if (want.has('hours')) tasks.push((async () => {
    const w = await get(PATHS.hours, 3600);
    // The API groups hours by weekday: [{ weekday, hours: [{ hour, avg_pm25 }] }]
    const cells = (Array.isArray(w) ? w : w.data || w.cells || []).flatMap(d => d.hours || [d]);
    const byHour = new Map();
    for (const c of cells) {
      const h = c.hour ?? c.hour_of_day, v = c.pm25 ?? c.pm25_avg ?? c.avg_pm25;
      if (h != null && v != null) byHour.set(h, [...(byHour.get(h) || []), v]);
    }
    const hours = [...byHour.entries()].map(([h, vs]) => [h, mean(vs)]).sort((a, b) => b[1] - a[1]);
    if (hours.length) parts.push({ title: 'AAI sensor network, average PM2.5 by hour of day (last 14 days)', source: LIVE, blocks: [
      `Worst hours (local time): ${hours.slice(0, 4).map(([h, v]) => `${h}:00 at ${v.toFixed(1)} µg/m³`).join(', ')}.`,
      `Cleanest hours (local time): ${hours.slice(-3).reverse().map(([h, v]) => `${h}:00 at ${v.toFixed(1)} µg/m³`).join(', ')}.`,
    ] });
  })());

  if (want.has('compare')) tasks.push((async () => {
    const rows = ((await get(PATHS.compare)).data || []).filter(r => r.pm25_current != null && r.pm25_previous != null);
    if (!rows.length) return;
    const last = rows[rows.length - 1];
    const cur = mean(rows.map(r => r.pm25_current)), prev = mean(rows.map(r => r.pm25_previous));
    const change = Math.round(100 * (cur - prev) / prev);
    parts.push({ title: 'AAI sensor network, today compared with yesterday (same hours)', source: LIVE, blocks: [
      `Today so far Almaty's average PM2.5 is ${r1(cur)} µg/m³, versus ${r1(prev)} µg/m³ over the same hours yesterday (${change >= 0 ? '+' : ''}${change}%).`,
      `At ${last.hour}:00 local time PM2.5 was ${last.pm25_current} µg/m³ today and ${last.pm25_previous} µg/m³ yesterday.`,
    ] });
  })());

  if (want.has('gases')) tasks.push((async () => {
    const rows = (await get(PATHS.gases, 600)).data || [];
    const avgOf = k => { const v = rows.map(r => r[k]).filter(x => x != null); return v.length ? r1(mean(v)) : null; };
    const g = ['no2', 'so2', 'o3', 'co'].map(k => [k.toUpperCase(), avgOf(k)]).filter(([, v]) => v != null);
    if (g.length) parts.push({ title: 'Eco SE partner network, latest hourly gas readings in Almaty', source: LIVE, blocks: [
      `Latest hourly averages across ${rows.length} Eco SE stations: ${g.map(([k, v]) => `${k} ${v}`).join(', ')} (units as reported by Eco SE).`,
    ] });
  })());

  if (want.has('pollen')) tasks.push((async () => {
    const p = (await get(PATHS.pollen, 1800)).data;
    if (p?.groups?.length) parts.push({ title: `Pollen Sense monitor in Almaty (${p.site?.name?.trim() || 'Almaty'}), latest reading`, source: LIVE, blocks: [
      `Pollen misery index in Almaty: ${p.groups.map(g => `${g.group_name} ${g.misery_level}${g.top_allergens?.length ? ` (${g.top_allergens.slice(0, 2).map(a => typeof a === 'string' ? a : a?.name ?? a?.category_name ?? a?.category_code ?? '').filter(Boolean).join(', ')})` : ''}`).join('; ')}.`,
    ] });
  })());

  if (want.has('cities')) tasks.push((async () => {
    const rows = (await get(PATHS.cities, 900)).data || [];
    const byCity = new Map();
    for (const r of rows) if (r.pm25_concentration != null) byCity.set(r.city, [...(byCity.get(r.city) || []), r.pm25_concentration]);
    const { stations } = await getStations();
    const list = [['almaty', mean(stations.map(s => s.pm25))], ...[...byCity.entries()].map(([c, vs]) => [c, mean(vs)])]
      .sort((a, b) => b[1] - a[1]);
    parts.push({ title: 'Regional comparison, latest PM2.5 by city (AAI sensors and IQAir / OpenAQ via AAI)', source: LIVE, blocks: [
      `Latest average PM2.5 by city: ${list.map(([c, v]) => `${c[0].toUpperCase() + c.slice(1)} ${r1(v)} µg/m³`).join('; ')}.`,
    ] });
  })());

  if (want.has('history') || want.has('no2_history')) {
    const ys = [...new Set([...years, ...dates.map(d => +d.slice(0, 4))])].filter(y => y >= 2019 && y <= thisYear());
    const useYears = ys.length ? ys.slice(0, 2) : [thisYear() - 1, thisYear()];
    for (const y of useYears) {
      if (want.has('history')) tasks.push(yearSummary('pm25', y, dates).then(s => s && parts.push(s)));
      if (want.has('no2_history')) tasks.push(yearSummary('no2', y, dates).then(s => s && parts.push(s)));
    }
  }

  // A question never waits more than 1.5 s for live data: cached data is instant; anything the AAI API
  // is still fetching is skipped this time (the fetch continues in the background for the next question)
  const settled = await Promise.allSettled(tasks.map(p =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('live data still loading')), 1500))])));
  for (const s of settled) if (s.status === 'rejected') console.warn('Live data part unavailable:', s.reason?.message);
  return [...parts]; // a copy: parts that arrive after the 1.5 s cut-off do not change this answer
}

// Structured numbers for the policy brief, the Telegram alert and digest, and the embeddable widget:
// city average now, districts now, today vs yesterday, and the last 14 days. Each part is optional
// (it is left out if the AAI API is slow), and none waits more than 2 seconds.
export async function airSummary() {
  const within = p => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 2000))]);
  const [city, districts, compare, days] = await Promise.allSettled([
    within(getStations().then(({ stations, meta }) => {
      if (!stations.length) return null;
      const avg = r1(mean(stations.map(s => s.pm25)));
      return { pm25: avg, category: pm25Category(avg).key, sensors: stations.length, updated: meta?.generated_at || null };
    })),
    within(get(PATHS.districts).then(d => (d.districts || []).filter(r => r.pm25_avg != null)
      .map(r => ({ district: r.district, pm25: r1(r.pm25_avg), category: pm25Category(r.pm25_avg).key, sensors: r.stations_count }))
      .sort((a, b) => b.pm25 - a.pm25))),
    within(get(PATHS.compare).then(c => {
      const rows = (c.data || []).filter(r => r.pm25_current != null && r.pm25_previous != null);
      if (!rows.length) return null;
      const cur = mean(rows.map(r => r.pm25_current)), prev = mean(rows.map(r => r.pm25_previous));
      return { today: r1(cur), yesterday: r1(prev), change_pct: prev ? Math.round(100 * (cur - prev) / prev) : null };
    })),
    within((async () => {
      const y = thisYear();
      const rows = [...(await get(PATHS.pm25Year(y - 1), 86400)), ...(await get(PATHS.pm25Year(y), 3600))]
        .map(d => ({ date: d.date, pm25: d.avg_pm25 ?? d.value })).filter(d => d.pm25 != null && d.date)
        .sort((a, b) => a.date.localeCompare(b.date));
      return rows.slice(-14).map(d => ({ date: d.date, pm25: r1(d.pm25), category: pm25Category(d.pm25).key }));
    })()),
  ]);
  const val = r => (r.status === 'fulfilled' ? r.value : null);
  return { at: new Date().toISOString(), city: val(city), districts: val(districts) || [], compare: val(compare), days: val(days) || [], source: LIVE };
}

// ---- Compare mode: two years, two districts, or Almaty against another city -------------------------
// Each side is a daily PM2.5 series. Only the days both sides have data are compared (same calendar day
// for two years), so a side with gaps or a year still in progress never skews the result.
export const DISTRICTS = ['Alatau', 'Almaly', 'Auezov', 'Bostandyq', 'Medeu', 'Nauryzbay', 'Turksib', 'Zhetysu'];
export const CITIES = { bishkek: 'Bishkek', tashkent: 'Tashkent', lahore: 'Lahore', kathmandu: 'Kathmandu' };
export const FIRST_YEAR = 2022;

async function daily({ district, city, year }) {
  const past = year < thisYear(), ttl = past ? 86400 : 3600;
  let raw;
  if (city) {
    const end = past ? `${year}-12-31` : new Date().toISOString().slice(0, 10);
    raw = await get(`/v1/asia/calendar?city=${city}&start_date=${year}-01-01&end_date=${end}`, ttl);
  } else raw = await get(district ? `/v1/pm25/calendar?year=${year}&district=${district}` : PATHS.pm25Year(year), ttl);
  const rows = Array.isArray(raw) ? raw : raw?.data || [];
  return new Map(rows.filter(d => typeof d.avg_pm25 === 'number' && d.date).map(d => [d.date, d.avg_pm25]));
}

export async function compareAir({ type, a, b, year }) {
  const now = thisYear();
  const okYear = y => Number.isInteger(y) && y >= FIRST_YEAR && y <= now;
  let A, B, labelA, labelB, keyOf = d => d;
  if (type === 'years') {
    const ya = Number(a), yb = Number(b);
    if (!okYear(ya) || !okYear(yb) || ya === yb) throw new Error('Pick two different years');
    [A, B] = await Promise.all([daily({ year: ya }), daily({ year: yb })]);
    labelA = String(ya); labelB = String(yb); keyOf = d => d.slice(5); // same calendar day
    year = null;
  } else if (type === 'districts') {
    year = Number(year);
    if (!DISTRICTS.includes(a) || !DISTRICTS.includes(b) || a === b) throw new Error('Pick two different districts');
    if (!okYear(year)) throw new Error('Pick a year');
    [A, B] = await Promise.all([daily({ district: a, year }), daily({ district: b, year })]);
    labelA = a; labelB = b;
  } else if (type === 'cities') {
    year = Number(year) || now;
    if (!CITIES[b]) throw new Error('Pick a city');
    if (!okYear(year)) throw new Error('Pick a year');
    [A, B] = await Promise.all([daily({ year }), daily({ city: b, year })]);
    labelA = 'Almaty'; labelB = CITIES[b]; a = 'almaty';
  } else throw new Error('Unknown comparison');

  // Pair the days both sides have
  const bByKey = new Map([...B].map(([d, v]) => [keyOf(d), v]));
  const pairs = [...A].filter(([d]) => bByKey.has(keyOf(d))).map(([d, v]) => ({ key: keyOf(d), a: v, b: bByKey.get(keyOf(d)) }))
    .sort((x, y) => x.key.localeCompare(y.key));
  const side = pick => {
    const vals = pairs.map(pick);
    const monthly = Array.from({ length: 12 }, (_, m) => {
      const mm = String(m + 1).padStart(2, '0');
      const vs = pairs.filter(p => p.key.slice(-5, -3) === mm).map(pick);
      return vs.length ? r1(mean(vs)) : null;
    });
    return { avg: vals.length ? r1(mean(vals)) : null, monthly,
      clean_days: vals.filter(v => v <= 15).length, over_limit_days: vals.filter(v => v > 35).length };
  };
  const sa = side(p => p.a), sb = side(p => p.b);
  return {
    type, year, days: pairs.length,
    from: pairs[0]?.key || null, to: pairs.at(-1)?.key || null,
    a: { key: a, label: labelA, ...sa }, b: { key: b, label: labelB, ...sb },
    ratio: sa.avg && sb.avg ? +(sa.avg / sb.avg).toFixed(2) : null,
    limits: { who: 15, kz: 35 }, source: LIVE,
  };
}

// ---- Best time to go out today -----------------------------------------------------------------------
// Hours already past: today's real city average. Hours to come: the average for that hour over the last
// 14 days, scaled by how today compares so far (clamped to ×0.5–×2). An estimate, not a weather forecast.
// No AI is used. Daytime windows only (2 hours, starting 06:00–20:00, Almaty time).
const TYPICAL = PATHS.hours, THIS_WEEK = '/v1/measurements/current-week-hours?city=almaty';

export async function outdoorPlan(at = new Date()) {
  const local = new Date(at.getTime() + 5 * 3600_000); // Almaty, UTC+5
  const hourNow = local.getUTCHours(), weekday = (local.getUTCDay() + 6) % 7; // 0 = Monday, as in the API
  const [typ, week] = await Promise.all([get(TYPICAL, 3600), get(THIS_WEEK, 300)]);
  const typical = Array.from({ length: 24 }, (_, h) => {
    let s = 0, n = 0;
    for (const d of typ?.data || []) {
      const x = d.hours?.find(r => r.hour === h);
      if (typeof x?.avg_pm25 === 'number') { const w = x.samples || 1; s += x.avg_pm25 * w; n += w; }
    }
    return n ? s / n : null;
  });
  const today = (week?.data || []).find(d => d.weekday === weekday);
  const actual = Array.from({ length: 24 }, (_, h) => {
    const x = today?.hours?.find(r => r.hour === h);
    return h <= hourNow && x && !x.is_future && typeof x.avg_pm25 === 'number' ? x.avg_pm25 : null;
  });
  if (typical.every(v => v == null)) throw new Error('No hourly data');
  const seen = actual.map((v, h) => [v, typical[h]]).filter(([v, t]) => v != null && t);
  const raw = seen.length >= 3 ? seen.reduce((s, [v]) => s + v, 0) / seen.reduce((s, [, t]) => s + t, 0) : 1;
  const ratio = Math.min(2, Math.max(0.5, raw));

  const plan = (day, scale) => {
    const hours = Array.from({ length: 24 }, (_, h) => {
      if (day === 'today' && actual[h] != null) return { h, pm25: r1(actual[h]), kind: 'actual' };
      if (day === 'today' && h <= hourNow) return { h, pm25: null, kind: 'actual' };
      return { h, pm25: typical[h] == null ? null : r1(typical[h] * scale), kind: 'estimate' };
    }).map(x => ({ ...x, category: x.pm25 == null ? 'unknown' : pm25Category(x.pm25).key }));
    const first = day === 'today' ? Math.max(6, hourNow + 1) : 6;
    const windows = [];
    for (let s = first; s <= 20; s++) {
      const a = hours[s].pm25, b = hours[s + 1].pm25;
      if (a != null && b != null) windows.push({ from: s, to: s + 2, pm25: r1((a + b) / 2) });
    }
    if (!windows.length) return null;
    const pick = better => windows.reduce((x, y) => (better(y.pm25, x.pm25) ? y : x));
    const best = pick((y, x) => y < x), worst = pick((y, x) => y > x);
    const tag = w => ({ ...w, category: pm25Category(w.pm25).key });
    return { day, hours, best: tag(best), worst: tag(worst) };
  };
  // Late in the evening there is no daytime window left: plan tomorrow from the typical day
  const p = plan('today', ratio) || plan('tomorrow', 1);
  const nowVal = actual[hourNow] ?? [...actual].reverse().find(v => v != null) ?? null;
  return {
    ...p, hour_now: hourNow, today_vs_typical: +ratio.toFixed(2),
    now: nowVal == null ? null : { pm25: r1(nowVal), category: pm25Category(nowVal).key },
    source: LIVE,
  };
}
