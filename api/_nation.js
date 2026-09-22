// Modello per le nazionali: pochissime partite fra loro, niente andata/ritorno simmetrico,
// quindi qui usiamo solo le partite recenti di ciascuna squadra (qualunque competizione
// nazionale), non una classifica di campionato.
const { afGet, num, ymd, seasonYear } = require('./_common');
const { makeFixture, predMap, isUpcoming, stamp, DONE } = require('./_league');

const K = 5;          // le nazionali giocano poco: pesiamo di più la media generale
const LOOKBACK = 540;  // giorni indietro per raccogliere abbastanza partite di ciascuna nazionale
const MIN_GAMES = 3;   // sotto questa soglia i valori di una squadra restano quasi alla media

function xgProxy(m) {
  const st = m.statistics || [];
  const f = t => st.find(x => x.type === t);
  const sot = f('Shots On Goal') || f('On Target'), tot = f('Shots Total');
  if (!sot || !tot) return null;
  const c = (s, t) => 0.30 * s + 0.05 * Math.max(0, t - s);
  return [c(num(sot.home), num(tot.home)), c(num(sot.away), num(tot.away))];
}

const memo = new Map();
async function buildNation(comp) {
  const c = memo.get(comp.id);
  if (c && Date.now() - c.t < 6 * 60 * 1000) return c.v;
  const v = await build(comp);
  memo.set(comp.id, { t: Date.now(), v });
  return v;
}

async function build(comp) {
  const now = new Date();
  const from = ymd(new Date(now.getTime() - LOOKBACK * 864e5)), to = ymd(new Date(now.getTime() + 45 * 864e5));
  const ev = await afGet({ action: 'get_events', from, to, league_id: comp.id });
  if (!ev.length) { const e = new Error('Nessuna partita trovata per questa competizione'); e.status = 502; throw e; }
  let preds = [];
  try { preds = await afGet({ action: 'get_predictions', from: ymd(now), to, league_id: comp.id }); } catch (_) {}

  const finished = ev.filter(m => DONE.includes(m.match_status) && m.match_hometeam_score !== '' && m.match_awayteam_score !== '')
    .sort((a, b) => stamp(a) - stamp(b));
  if (!finished.length) { const e = new Error('Nessun risultato disponibile per questa competizione'); e.status = 502; throw e; }

  let gf = 0, gp = 0;
  const recent = {}, form = {}, last = {}, results = {}, T = {};
  for (const m of finished) {
    const x = num(m.match_hometeam_score), y = num(m.match_awayteam_score), xg = xgProxy(m);
    const h = String(m.match_hometeam_id), a = String(m.match_awayteam_id);
    T[h] = m.match_hometeam_name; T[a] = m.match_awayteam_name;
    gf += x + y; gp += 2;
    results[String(m.match_id)] = [x, y];
    (recent[h] = recent[h] || []).push({ f: x, a: y, xf: xg ? xg[0] : null, xa: xg ? xg[1] : null });
    (recent[a] = recent[a] || []).push({ f: y, a: x, xf: xg ? xg[1] : null, xa: xg ? xg[0] : null });
    (form[h] = form[h] || []).push(x > y ? 'V' : x === y ? 'N' : 'P');
    (form[a] = form[a] || []).push(y > x ? 'V' : x === y ? 'N' : 'P');
    last[h] = stamp(m); last[a] = stamp(m);
  }
  // partite future già in calendario: aggiungiamo comunque le squadre coinvolte
  ev.filter(isUpcoming).forEach(m => { T[String(m.match_hometeam_id)] = m.match_hometeam_name; T[String(m.match_awayteam_id)] = m.match_awayteam_name; });

  const avg = gp ? gf / gp : 1.25; // media gol a squadra, fra nazionali di solito più bassa dei club
  const teams = Object.keys(T).map(id => {
    const rec = (recent[id] || []).slice(-10); // fino alle ultime 10, per avere abbastanza campione
    const mixF = rec.reduce((s, m) => s + (m.xf == null ? m.f : .5 * m.f + .5 * m.xf), 0);
    const mixA = rec.reduce((s, m) => s + (m.xa == null ? m.a : .5 * m.a + .5 * m.xa), 0);
    const a = (mixF + K * avg) / (rec.length + K) / avg;
    const d = (mixA + K * avg) / (rec.length + K) / avg;
    const f5 = (form[id] || []).slice(-5); while (f5.length < 5) f5.unshift('N');
    return {
      id, name: T[id], crest: null, played: rec.length,
      a, d, ah: a, dh: d, aa: a, da: d, // nessuna divisione casa/trasferta: molte gare in campo neutro
      form: f5, absAtt: null, absDef: null, absList: null,
      lowData: rec.length < MIN_GAMES
    };
  });

  const pm = predMap(preds);
  const lastCopy = Object.assign({}, last);
  const fixtures = ev.filter(isUpcoming).sort((a, b) => stamp(a) - stamp(b)).slice(0, 14)
    .map(m => makeFixture(m, lastCopy, {}, pm));

  return {
    updated: new Date().toISOString(), season: seasonYear(), nation: true,
    league: { id: comp.id, name: comp.name, country: comp.country || 'Nazionali' },
    played: Math.round(gp / 2 / Math.max(1, teams.length)),
    lg: { h: avg, a: avg, base: { h: .40, d: .27, a: .33 } }, // fattore campo ridotto: molte gare neutre o poco marcate
    teams, fixtures, _results: results, _last: last, _players: {}
  };
}
module.exports = { buildNation };
