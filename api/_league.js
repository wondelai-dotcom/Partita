const { afGet, checkedLeague, num, ymd, seasonYear } = require('./_common');

const K = 4, K2 = 3;
const DONE = ['Finished', 'After ET', 'After Pen.'];
const stamp = m => new Date(m.match_date + 'T' + (m.match_time || '00:00') + ':00');
const names = arr => (arr || []).map(p => p.lineup_player || p.player_name || (typeof p === 'string' ? p : '')).filter(Boolean);
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Stima dei gol "meritati" dai tiri (i tiri in porta pesano di più)
function xgProxy(m) {
  const st = m.statistics || [];
  const f = t => st.find(x => x.type === t);
  const sot = f('Shots On Goal') || f('On Target'), tot = f('Shots Total');
  if (!sot || !tot) return null;
  const c = (s, t) => 0.30 * s + 0.05 * Math.max(0, t - s);
  return [c(num(sot.home), num(tot.home)), c(num(sot.away), num(tot.away))];
}

function matchPlayer(players, name) {
  const n = norm(name), last = n.split(/\s+/).pop(), ini = n[0];
  let c = players.filter(p => norm(p.name).split(/\s+/).pop() === last);
  if (c.length > 1) { const c2 = c.filter(p => norm(p.name)[0] === ini); if (c2.length) c = c2; }
  return c[0] || null;
}

// Effetto delle assenze pesato per importanza del giocatore
function absEffect(players, absent) {
  if (!players || !players.length) return null;
  const maxP = Math.max(0, ...players.map(p => p.played));
  const totGA = players.reduce((s, p) => s + p.goals + p.assists, 0);
  const cand = absent ? absent.map(n => matchPlayer(players, n) || { unknown: true, name: n }) : players.filter(p => p.injured);
  let att = 1, def = 1; const list = [];
  for (const p of cand) {
    if (p.unknown) { att *= .985; def *= 1.01; list.push({ name: p.name, role: '', att: -1.5, def: 1 }); continue; }
    const w = maxP ? Math.min(1, p.played / maxP) : 0;
    if (!absent && w < .25) continue; // riserve segnalate: effetto trascurabile
    const ga = totGA ? (p.goals + p.assists) / totGA : 0;
    const aL = p.type === 'Goalkeepers' ? 0 : Math.min(.15, .5 * ga);
    const dU = ({ Goalkeepers: .08, Defenders: .05, Midfielders: .02 })[p.type] || 0, dL = dU * w;
    att *= 1 - aL; def *= 1 + dL;
    list.push({ name: p.name, role: p.type || '', att: -Math.round(aL * 1000) / 10, def: Math.round(dL * 1000) / 10 });
  }
  return { att: Math.max(.8, att), def: Math.min(1.2, def), list: list.slice(0, 8) };
}

function makeFixture(m, last, P, pm) {
  const h = String(m.match_hometeam_id), a = String(m.match_awayteam_id), when = stamp(m);
  const rest = t => last[t] ? Math.round((when - last[t]) / 864e5 * 10) / 10 : null;
  const restH = rest(h), restA = rest(a);
  last[h] = when; last[a] = when;
  const lu = m.lineup || {};
  const sh = lu.home && lu.home.starting_lineups, sa = lu.away && lu.away.starting_lineups;
  const hasLineup = !!((sh && sh.length) && (sa && sa.length));
  const missH = names(lu.home && lu.home.missing_players), missA = names(lu.away && lu.away.missing_players);
  return {
    id: String(m.match_id), home: h, away: a,
    date: m.match_date + 'T' + (m.match_time || '00:00') + ':00',
    matchday: m.match_round || m.stage_name || '', stadium: m.match_stadium || '', referee: m.match_referee || '',
    restH, restA, hasLineup,
    lineups: hasLineup ? { h: names(sh), a: names(sa), hs: m.match_hometeam_system || '', as: m.match_awayteam_system || '' } : null,
    miss: { h: missH, a: missA },
    abs: hasLineup ? { h: absEffect(P[h], missH), a: absEffect(P[a], missA) } : null,
    pred: pm[String(m.match_id)] || null
  };
}
function predMap(preds) {
  const pm = {};
  (Array.isArray(preds) ? preds : []).forEach(x => {
    const h = num(x.prob_HW), d = num(x.prob_D), a = num(x.prob_AW);
    if (h + d + a > 0) pm[String(x.match_id)] = { h: h / 100, d: d / 100, a: a / 100, o25: num(x.prob_O) / 100, btts: num(x.prob_bts) / 100 };
  });
  return pm;
}
// In programma = senza punteggio e non rinviata/annullata (tollera stati diversi da "vuoto")
const isUpcoming = m => m.match_hometeam_score === '' && !DONE.includes(m.match_status) && !['Postponed', 'Cancelled', 'Awarded'].includes(m.match_status);
const romeDay = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

const memo = new Map();
async function buildLeague(lid) {
  const c = memo.get(lid);
  if (c && Date.now() - c.t < 6 * 60 * 1000) return c.v;
  const v = await build(lid);
  memo.set(lid, { t: Date.now(), v });
  return v;
}

async function build(lid) {
  const L = await checkedLeague(lid);
  const now = new Date();
  const today = romeDay(now);
  const from = ymd(new Date(now.getTime() - 75 * 864e5)), to = ymd(new Date(now.getTime() + 30 * 864e5));
  const st = await afGet({ action: 'get_standings', league_id: L.id });
  if (!st.length) { const e = new Error('Classifica non disponibile per questo campionato'); e.status = 502; throw e; }
  // passato (forma, statistiche) e calendario (da oggi in poi) in due richieste separate
  let past = [], fut = [], errPast = '', errFut = '';
  try { past = await afGet({ action: 'get_events', from, to: ymd(new Date(now.getTime() - 864e5)), league_id: L.id }); } catch (e) { errPast = e.message; }
  try { fut = await afGet({ action: 'get_events', from: today, to, league_id: L.id }); } catch (e) { errFut = e.message; }
  const seen = new Set(); const ev = [];
  [].concat(Array.isArray(past) ? past : [], Array.isArray(fut) ? fut : []).forEach(m => { const k = String(m.match_id); if (!seen.has(k)) { seen.add(k); ev.push(m); } });
  let preds = [], tdata = [];
  try { preds = await afGet({ action: 'get_predictions', from: today, to, league_id: L.id }); } catch (_) {}
  try { tdata = await afGet({ action: 'get_teams', league_id: L.id }); } catch (_) {}

  const P = {};
  (Array.isArray(tdata) ? tdata : []).forEach(t => {
    P[String(t.team_key)] = (t.players || []).map(p => ({
      name: p.player_name, type: p.player_type, played: num(p.player_match_played),
      goals: num(p.player_goals), assists: num(p.player_assists), injured: p.player_injured === 'Yes'
    }));
  });

  const rows = new Map();
  st.forEach(r => { if (!rows.has(String(r.team_id))) rows.set(String(r.team_id), r); });
  let gf = 0, gp = 0, hgf = 0, hp = 0, agf = 0, ap = 0, hw = 0, hd = 0, hl = 0;
  rows.forEach(r => {
    gf += num(r.overall_league_GF); gp += num(r.overall_league_payed);
    hgf += num(r.home_league_GF); hp += num(r.home_league_payed);
    agf += num(r.away_league_GF); ap += num(r.away_league_payed);
    hw += num(r.home_league_W); hd += num(r.home_league_D); hl += num(r.home_league_L);
  });
  const LGh = hp ? hgf / hp : 1.5, LGa = ap ? agf / ap : 1.2;
  const avg = gp ? gf / gp : (LGh + LGa) / 2;
  const base = hp ? { h: hw / hp, d: hd / hp, a: hl / hp } : { h: .45, d: .26, a: .29 };

  const key = m => m.match_date + ' ' + (m.match_time || '00:00');
  const finished = ev.filter(m => DONE.includes(m.match_status) && m.match_hometeam_score !== '' && m.match_awayteam_score !== '')
    .sort((a, b) => key(a).localeCompare(key(b)));
  const recent = {}, form = {}, last = {}, results = {};
  for (const m of finished) {
    const x = num(m.match_hometeam_score), y = num(m.match_awayteam_score), xg = xgProxy(m);
    const h = String(m.match_hometeam_id), a = String(m.match_awayteam_id);
    results[String(m.match_id)] = [x, y];
    (recent[h] = recent[h] || []).push({ f: x, a: y, xf: xg ? xg[0] : null, xa: xg ? xg[1] : null });
    (recent[a] = recent[a] || []).push({ f: y, a: x, xf: xg ? xg[1] : null, xa: xg ? xg[0] : null });
    (form[h] = form[h] || []).push(x > y ? 'V' : x === y ? 'N' : 'P');
    (form[a] = form[a] || []).push(y > x ? 'V' : x === y ? 'N' : 'P');
    last[h] = stamp(m); last[a] = stamp(m);
  }

  const teams = [...rows.values()].map(r => {
    const id = String(r.team_id), p = num(r.overall_league_payed), pH = num(r.home_league_payed), pA = num(r.away_league_payed);
    let a = (num(r.overall_league_GF) + K * avg) / (p + K) / avg, d = (num(r.overall_league_GA) + K * avg) / (p + K) / avg;
    const rec = (recent[id] || []).slice(-6);
    if (rec.length) {
      const mixF = rec.reduce((s, m) => s + (m.xf == null ? m.f : .5 * m.f + .5 * m.xf), 0);
      const mixA = rec.reduce((s, m) => s + (m.xa == null ? m.a : .5 * m.a + .5 * m.xa), 0);
      const w = .3 * Math.min(1, rec.length / 4);
      a = (1 - w) * a + w * ((mixF + K * avg) / (rec.length + K) / avg);
      d = (1 - w) * d + w * ((mixA + K * avg) / (rec.length + K) / avg);
    }
    const f5 = (form[id] || []).slice(-5);
    while (f5.length < 5) f5.unshift('N');
    const ab = absEffect(P[id], null);
    return {
      id, name: r.team_name, crest: r.team_badge || null, played: p, a, d,
      ah: (num(r.home_league_GF) + K2 * LGh) / (pH + K2) / LGh,
      dh: (num(r.home_league_GA) + K2 * LGa) / (pH + K2) / LGa,
      aa: (num(r.away_league_GF) + K2 * LGa) / (pA + K2) / LGa,
      da: (num(r.away_league_GA) + K2 * LGh) / (pA + K2) / LGh,
      form: f5,
      absAtt: ab ? ab.att : null, absDef: ab ? ab.def : null, absList: ab ? ab.list : null
    };
  });

  const pm = predMap(preds);
  const lastCopy = Object.assign({}, last);
  const fixtures = ev.filter(isUpcoming).sort((a, b) => stamp(a) - stamp(b)).slice(0, 14).map(m => makeFixture(m, lastCopy, P, pm));

  const todayList = ev.filter(m => m.match_date === today).sort((a, b) => stamp(a) - stamp(b)).map(m => ({
    id: String(m.match_id), home: String(m.match_hometeam_id), away: String(m.match_awayteam_id),
    time: m.match_time || '', status: m.match_status || '', hg: m.match_hometeam_score, ag: m.match_awayteam_score,
    live: String(m.match_live) === '1', finished: DONE.includes(m.match_status), upcoming: isUpcoming(m)
  }));
  const futArr = Array.isArray(fut) ? fut : [];
  const statuses = {}; futArr.forEach(m => { const k = m.match_status === '' ? '(vuoto)' : m.match_status; statuses[k] = (statuses[k] || 0) + 1; });
  const diag = {
    leagueSeason: L.season || '', today, future: futArr.length, upcoming: futArr.filter(isUpcoming).length,
    past: (Array.isArray(past) ? past : []).length, finished: finished.length, statuses,
    firstFuture: futArr.length ? futArr.map(m => m.match_date).sort()[0] : '', lastPast: finished.length ? finished[finished.length - 1].match_date : '',
    errFut, errPast
  };
  return {
    updated: new Date().toISOString(), season: seasonYear(),
    league: { id: L.id, name: L.name, country: L.country },
    played: Math.round(gp / 2), lg: { h: LGh, a: LGa, base }, teams, fixtures, today: todayList, diag,
    // usati solo dal server (non inviati al browser)
    _results: results, _last: last, _players: P
  };
}

const publicView = d => { const o = Object.assign({}, d); delete o._results; delete o._last; delete o._players; return o; };

module.exports = { buildLeague, publicView, makeFixture, predMap, isUpcoming, absEffect, stamp, DONE };
