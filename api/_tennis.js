const BASE = 'https://api.api-tennis.com/tennis/';

async function tGet(params) {
  const key = process.env.TENNIS_API_KEY;
  if (!key) { const e = new Error("Manca la variabile d'ambiente TENNIS_API_KEY"); e.status = 500; throw e; }
  const qs = new URLSearchParams(Object.assign({}, params, { APIkey: key }));
  const r = await fetch(BASE + '?' + qs.toString());
  let d;
  try { d = await r.json(); } catch (_) { const e = new Error('Risposta non valida da API-Tennis (' + r.status + ')'); e.status = 502; throw e; }
  if (!r.ok || !d || d.success !== 1) { const e = new Error((d && d.message) || 'Errore API-Tennis'); e.status = 502; throw e; }
  return d.result;
}

// Tipi di evento (chiavi): li leggiamo dal servizio invece di fissarli a mano, perché possono cambiare
let etCache = null;
async function eventTypes() {
  if (etCache && Date.now() - etCache.t < 24 * 60 * 60 * 1000) return etCache.v;
  const all = await tGet({ method: 'get_events' });
  const find = name => { const f = all.find(x => String(x.event_type_type).trim().toLowerCase() === name); return f ? String(f.event_type_key) : null; };
  const v = { atp: find('atp singles'), wta: find('wta singles') };
  etCache = { t: Date.now(), v };
  return v;
}

// Tornei più importanti: riconosciuti dal nome, non da una lista di ID (che cambiano ogni anno)
const MAJORS = [
  { key: 'ao', label: 'Australian Open', surface: 'hard', test: n => /australian open/i.test(n) },
  { key: 'rg', label: 'Roland Garros', surface: 'clay', test: n => /roland garros|french open/i.test(n) },
  { key: 'wim', label: 'Wimbledon', surface: 'grass', test: n => /wimbledon/i.test(n) },
  { key: 'uso', label: 'US Open', surface: 'hard', test: n => /us open/i.test(n) },
  { key: 'iw', label: 'Indian Wells', surface: 'hard', test: n => /indian wells/i.test(n) },
  { key: 'mia', label: 'Miami', surface: 'hard', test: n => /miami/i.test(n) },
  { key: 'mc', label: 'Monte-Carlo', surface: 'clay', test: n => /monte.?carlo/i.test(n) },
  { key: 'mad', label: 'Madrid', surface: 'clay', test: n => /madrid/i.test(n) },
  { key: 'rom', label: 'Roma', surface: 'clay', test: n => /\brome\b|internazionali|italian open/i.test(n) },
  { key: 'can', label: 'Canada', surface: 'hard', test: n => /canad|toronto|montreal|montr[eé]al/i.test(n) },
  { key: 'cin', label: 'Cincinnati', surface: 'hard', test: n => /cincinnati/i.test(n) },
  { key: 'shg', label: 'Shanghai', surface: 'hard', test: n => /shanghai/i.test(n) },
  { key: 'par', label: 'Parigi (Masters)', surface: 'hard', test: n => /paris masters|bercy/i.test(n) },
  { key: 'atpf', label: 'ATP Finals', surface: 'hard', test: n => /atp finals|nitto atp/i.test(n) },
  { key: 'wtaf', label: 'WTA Finals', surface: 'hard', test: n => /wta finals/i.test(n) }
];
const isMajor = n => MAJORS.some(m => m.test(n));
const surfaceOf = n => { const m = MAJORS.find(x => x.test(n)); return m ? m.surface : null; };

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const ymd = d => d.toISOString().slice(0, 10);

module.exports = { tGet, eventTypes, MAJORS, isMajor, surfaceOf, num, ymd };
