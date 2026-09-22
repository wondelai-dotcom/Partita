const BASE = 'https://apiv3.apifootball.com/';

async function afGet(params) {
  const key = process.env.APIFOOTBALL_KEY;
  if (!key) {
    const e = new Error("Manca la variabile d'ambiente APIFOOTBALL_KEY");
    e.status = 500;
    throw e;
  }
  const qs = new URLSearchParams({ ...params, APIkey: key });
  const r = await fetch(BASE + '?' + qs.toString());
  let d;
  try { d = await r.json(); } catch (_) {
    const e = new Error('Risposta non valida da APIfootball (' + r.status + ')');
    e.status = 502;
    throw e;
  }
  // Gli errori arrivano come {"error":404,"message":"..."}: 404 = nessun risultato
  if (d && !Array.isArray(d) && d.error !== undefined && typeof d.error !== 'object') {
    if (Number(d.error) === 404) return [];
    const e = new Error(d.message || 'Errore APIfootball ' + d.error);
    e.status = 502;
    throw e;
  }
  if (!r.ok) {
    const e = new Error('APIfootball ha risposto ' + r.status);
    e.status = 502;
    throw e;
  }
  return d;
}

// Campionati principali: [paese, nome del campionato]
const DEFS = [
  ['Italy', 'serie a'],
  ['England', 'premier league'],
  ['Spain', 'la liga'],
  ['Germany', 'bundesliga'],
  ['France', 'ligue 1'],
  ['Netherlands', 'eredivisie'],
  ['Portugal', 'primeira liga']
];
// Coppe per club: riconosciute SOLO dal nome della competizione, non dal paese
// (i fornitori etichettano il paese delle coppe in modi diversi, quindi non ci affidiamo a quello)
// Esclusioni generiche per le coppe per CLUB (qui "qualif" va escluso: vogliamo solo la fase a gironi/eliminazione, non i turni preliminari)
const EXCL_CLUB = /women|femminile|qualif|play-?off|preliminary|u-?1[5-9]|u-?20|u-?21|u-?23|youth|beach|futsal|amateur|reserve|b-team|primavera/i;
const CUPS = [
  { key: 'ucl', test: n => /champions league/i.test(n) && !EXCL_CLUB.test(n) },
  { key: 'uel', test: n => /europa league/i.test(n) && !/conference/i.test(n) && !EXCL_CLUB.test(n) }
];
// Esclusioni per le NAZIONALI: qui NON escludiamo "qualif", perché le qualificazioni sono proprio ciò che cerchiamo
const EXCL_NAT = /women|femminile|u-?1[5-9]|u-?20|u-?21|u-?23|youth|beach|futsal|amateur/i;
// Nazionali: scoperte per nome fra TUTTE le competizioni, qualunque sia il paese associato
const NATIONS = [
  { key: 'nl', label: 'UEFA Nations League', test: n => /nations league/i.test(n) && !EXCL_NAT.test(n) },
  { key: 'wcq', label: 'Qualificazioni Mondiali', test: n => /world cup/i.test(n) && /qualif/i.test(n) && !EXCL_NAT.test(n) },
  { key: 'euq', label: 'Qualificazioni Europei', test: n => /(european championship|euro(?!pa))/i.test(n) && /qualif/i.test(n) && !EXCL_NAT.test(n) },
  { key: 'wc', label: 'Mondiali', test: n => /world cup/i.test(n) && !/qualif/i.test(n) && !EXCL_NAT.test(n) },
  { key: 'euf', label: 'Europei', test: n => /european championship/i.test(n) && !/qualif/i.test(n) && !EXCL_NAT.test(n) },
  { key: 'fr', label: 'Amichevoli internazionali', test: n => /international friendl/i.test(n) && !EXCL_NAT.test(n) }
];
const MAX_NATIONS = 10; // limite di sicurezza: non riempire le schede con troppe competizioni minori

let cache = null, allCache = null;
async function allLeaguesRaw() {
  if (allCache && Date.now() - allCache.t < 6 * 60 * 1000) return allCache.v;
  const v = await afGet({ action: 'get_leagues' });
  allCache = { t: Date.now(), v };
  return v;
}
async function listLeagues() {
  if (cache && Date.now() - cache.t < 6 * 60 * 1000) return cache.v;
  const all = await allLeaguesRaw();
  const out = [];
  const pickLatest = arr => arr.sort((x, y) => String(y.league_season).localeCompare(String(x.league_season)))[0];
  for (const [country, name] of DEFS) {
    const c = all.filter(l =>
      String(l.country_name).trim().toLowerCase() === country.toLowerCase() &&
      String(l.league_name).trim().toLowerCase() === name);
    if (!c.length) continue;
    const f = pickLatest(c);
    out.push({ id: String(f.league_id), name: f.league_name, country: f.country_name, logo: f.league_logo || null, season: f.league_season, kind: 'league' });
  }
  for (const cup of CUPS) {
    const c = all.filter(l => cup.test(String(l.league_name || '').trim()));
    if (!c.length) continue;
    const f = pickLatest(c);
    out.push({ id: String(f.league_id), name: f.league_name, country: 'Europa', logo: f.league_logo || null, season: f.league_season, kind: 'cup' });
  }
  const seen = new Set();
  const nats = [];
  for (const nat of NATIONS) {
    const matches = all.filter(l => nat.test(String(l.league_name || '').trim()));
    // per ogni tipo possono esserci più zone/gironi (es. per confederazione): le teniamo tutte,
    // ma solo una stagione per ciascuna, e diamo priorità a UEFA/Europa quando il nome lo indica
    const byName = new Map();
    matches.forEach(l => {
      const k = String(l.league_name).trim().toLowerCase();
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(l);
    });
    for (const [, arr] of byName) {
      const f = pickLatest(arr);
      const idKey = String(f.league_id);
      if (seen.has(idKey)) continue;
      seen.add(idKey);
      const uefa = /uefa|europe/i.test(f.league_name) || /europe/i.test(String(f.country_name));
      nats.push({ id: idKey, name: f.league_name, country: f.country_name || 'Nazionali', logo: f.league_logo || null, season: f.league_season, kind: 'nation', _prio: uefa ? 0 : 1 });
    }
  }
  nats.sort((a, b) => a._prio - b._prio || a.name.localeCompare(b.name));
  nats.slice(0, MAX_NATIONS).forEach(n => { delete n._prio; out.push(n); });

  cache = { t: Date.now(), v: out };
  return out;
}

// Accetta solo i campionati della lista: evita che qualcuno usi la tua chiave per altre richieste
async function checkedLeague(id) {
  const list = await listLeagues();
  const f = list.find(l => l.id === String(id || ''));
  if (!f) {
    const e = new Error('Campionato non disponibile');
    e.status = 400;
    throw e;
  }
  return f;
}

// Database Upstash Redis (opzionale): serve per misurare la precisione e limitare i commenti AI
const redisUrl = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const redisTok = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const hasRedis = () => !!(redisUrl() && redisTok());
async function redis(cmd) {
  if (!hasRedis()) return null;
  const r = await fetch(redisUrl(), { method: 'POST', headers: { Authorization: 'Bearer ' + redisTok(), 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const d = await r.json();
  if (d.error) throw new Error('Redis: ' + d.error);
  return d.result;
}
async function redisPipe(cmds) {
  if (!hasRedis() || !cmds.length) return [];
  const r = await fetch(redisUrl().replace(/\/$/, '') + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + redisTok(), 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  const d = await r.json();
  if (!Array.isArray(d)) throw new Error('Redis: risposta non valida');
  return d.map(x => x.result);
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const ymd = d => d.toISOString().slice(0, 10);
function seasonYear(d = new Date()) { return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; }

module.exports = { afGet, listLeagues, checkedLeague, hasRedis, redis, redisPipe, num, ymd, seasonYear };
