const BASE = 'https://apiv3.apifootball.com/';
const ITALY_COUNTRY_ID = '5';

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

let cachedLeague = null;
async function serieAId() {
  if (process.env.SERIE_A_LEAGUE_ID) return process.env.SERIE_A_LEAGUE_ID;
  if (cachedLeague) return cachedLeague;
  const L = await afGet({ action: 'get_leagues', country_id: ITALY_COUNTRY_ID });
  const f = L.find(l => String(l.league_name).trim().toLowerCase() === 'serie a');
  if (!f) {
    const e = new Error('Serie A non trovata: controlla che sia inclusa nel tuo piano');
    e.status = 502;
    throw e;
  }
  cachedLeague = f.league_id;
  return cachedLeague;
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const ymd = d => d.toISOString().slice(0, 10);

function seasonYear(d = new Date()) {
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
}

module.exports = { afGet, serieAId, num, ymd, seasonYear };
