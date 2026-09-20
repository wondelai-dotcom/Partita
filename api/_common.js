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

let cache = null;
async function listLeagues() {
  if (cache && Date.now() - cache.t < 6 * 60 * 1000) return cache.v;
  const all = await afGet({ action: 'get_leagues' });
  const out = [];
  for (const [country, name] of DEFS) {
    const c = all.filter(l =>
      String(l.country_name).trim().toLowerCase() === country.toLowerCase() &&
      String(l.league_name).trim().toLowerCase() === name);
    if (!c.length) continue;
    c.sort((x, y) => String(y.league_season).localeCompare(String(x.league_season)));
    const f = c[0];
    out.push({ id: String(f.league_id), name: f.league_name, country: f.country_name, logo: f.league_logo || null, season: f.league_season });
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

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const ymd = d => d.toISOString().slice(0, 10);
function seasonYear(d = new Date()) { return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; }

module.exports = { afGet, listLeagues, checkedLeague, num, ymd, seasonYear };
