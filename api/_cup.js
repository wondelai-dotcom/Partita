const { afGet, listLeagues, num, ymd, seasonYear } = require('./_common');
const { buildLeague, makeFixture, predMap, isUpcoming, stamp, DONE } = require('./_league');

// Forza relativa dei campionati: STIMA indicativa (non calcolata da questi dati), serve solo a confrontare squadre di paesi diversi
const STRENGTH = { england: 1.00, spain: .97, italy: .95, germany: .94, france: .90, netherlands: .80, portugal: .80 };
const memo = new Map();

async function buildCup(cup) {
  const c = memo.get(cup.id);
  if (c && Date.now() - c.t < 6 * 60 * 1000) return c.v;
  const v = await build(cup);
  memo.set(cup.id, { t: Date.now(), v });
  return v;
}

async function build(cup) {
  const now = new Date();
  const from = ymd(new Date(now.getTime() - 10 * 864e5)), to = ymd(new Date(now.getTime() + 21 * 864e5));
  const ev = await afGet({ action: 'get_events', from, to, league_id: cup.id });
  let preds = [];
  try { preds = await afGet({ action: 'get_predictions', from: ymd(now), to, league_id: cup.id }); } catch (_) {}

  const doms = (await listLeagues()).filter(l => l.kind === 'league');
  const datas = (await Promise.all(doms.map(l => buildLeague(l.id).catch(() => null)))).filter(Boolean);
  if (!datas.length) { const e = new Error('Dati dei campionati non disponibili'); e.status = 502; throw e; }

  const T = {}, P = {}, last = {};
  for (const d of datas) {
    const f = STRENGTH[String(d.league.country).toLowerCase()] || .85;
    Object.assign(P, d._players); Object.assign(last, d._last);
    for (const t of d.teams) {
      T[t.id] = Object.assign({}, t, { a: t.a * f, ah: t.ah * f, aa: t.aa * f, d: t.d / f, dh: t.dh / f, da: t.da / f, league: d.league.name });
    }
  }
  const pm = predMap(preds);
  const results = {};
  ev.filter(m => DONE.includes(m.match_status) && m.match_hometeam_score !== '' && m.match_awayteam_score !== '')
    .forEach(m => { results[String(m.match_id)] = [num(m.match_hometeam_score), num(m.match_awayteam_score)]; });

  const lastCopy = Object.assign({}, last);
  const fixtures = ev.filter(isUpcoming)
    .filter(m => T[String(m.match_hometeam_id)] && T[String(m.match_awayteam_id)])
    .sort((a, b) => stamp(a) - stamp(b)).slice(0, 14)
    .map(m => makeFixture(m, lastCopy, P, pm));

  const teams = Object.values(T);
  return {
    updated: new Date().toISOString(), season: seasonYear(), cup: true,
    league: { id: cup.id, name: cup.name, country: 'Europa' },
    played: Math.round(teams.reduce((s, t) => s + t.played, 0) / Math.max(1, teams.length)),
    lg: { h: 1.5, a: 1.2, base: { h: .46, d: .26, a: .28 } },
    teams, fixtures, _results: results, _last: last, _players: P
  };
}
module.exports = { buildCup };
