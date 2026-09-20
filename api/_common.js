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
// Coppe europee: riconosciute dal nome, nel paese "Eurocups"
const CUPS = [
  { key: 'ucl', test: n => n.includes('champions league') && !/women|qualif|play-?off|youth/.test(n) },
  { key: 'uel', test: n => n.includes('europa league') && !/conference|women|qualif|play-?off|youth/.test(n) }
];

let cache = null;
async function listLeagues() {
  if (cache && Date.now() - cache.t < 6 * 60 * 1000) return cache.v;
  const all = await afGet({ action: 'get_leagues' });
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
    const c = all.filter(l => String(l.country_name).trim().toLowerCase() === 'eurocups' && cup.test(String(l.league_name).trim().toLowerCase()));
    if (!c.length) continue;
    const f = pickLatest(c);
    out.push({ id: String(f.league_id), name: f.league_name, country: 'Europa', logo: f.league_logo || null, season: f.league_season, kind: 'cup' });
  }
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
