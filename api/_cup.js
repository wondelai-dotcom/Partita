// Coppe per club: la rosa delle squadre viene SOLO dalle partite reali della coppa
// (non da tutti i campionati), così non compaiono squadre che non partecipano.
const { afGet, listLeagues, num, ymd, seasonYear } = require('./_common');
const { buildLeague, makeFixture, predMap, isUpcoming, stamp, DONE, xgProxyPublic } = require('./_league');

// Forza relativa del campionato di provenienza: STIMA indicativa, usata solo quando conosciamo il paese della squadra
const STRENGTH = { england: 1.00, spain: .97, italy: .95, germany: .94, france: .90, netherlands: .80, portugal: .80 };
const K_CUP = 5; // shrinkage verso la media quando i dati vengono solo dalle partite di coppa

function xgProxy(m) {
  const st = m.statistics || [];
  const f = t => st.find(x => x.type === t);
  const sot = f('Shots On Goal') || f('On Target'), tot = f('Shots Total');
  if (!sot || !tot) return null;
  const c = (s, t) => 0.30 * s + 0.05 * Math.max(0, t - s);
  return [c(num(sot.home), num(tot.home)), c(num(sot.away), num(tot.away))];
}

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
  // finestra ampia: la fase a gironi/campionato dura da settembre a gennaio inoltrato
  const from = ymd(new Date(now.getTime() - 150 * 864e5)), to = ymd(new Date(now.getTime() + 30 * 864e5));
  const ev = await afGet({ action: 'get_events', from, to, league_id: cup.id });
  if (!ev.length) { const e = new Error('Nessuna partita trovata per questa competizione nel periodo considerato'); e.status = 502; throw e; }
  let preds = [];
  try { preds = await afGet({ action: 'get_predictions', from: ymd(now), to, league_id: cup.id }); } catch (_) {}

  // dati dei campionati nazionali: usati solo per completare le squadre che riconosciamo (stesso id lì e in coppa)
  let datas = [];
  try {
    const doms = (await listLeagues()).filter(l => l.kind === 'league');
    datas = (await Promise.all(doms.map(l => buildLeague(l.id).catch(() => null)))).filter(Boolean);
  } catch (_) {}
  const domTeam = {}, domCountry = {}, P = {};
  datas.forEach(d => { Object.assign(P, d._players); d.teams.forEach(t => { domTeam[t.id] = t; domCountry[t.id] = d.league.country; }); });

  const key = m => m.match_date + ' ' + (m.match_time || '00:00');
  const finished = ev.filter(m => DONE.includes(m.match_status) && m.match_hometeam_score !== '' && m.match_awayteam_score !== '')
    .sort((a, b) => key(a).localeCompare(key(b)));
  const T = {}, recent = {}, form = {}, last = {}, results = {};
  let gf = 0, gp = 0;
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
  // squadre delle partite future: le includiamo anche se non hanno ancora giocato in questa coppa
  ev.filter(isUpcoming).forEach(m => { T[String(m.match_hometeam_id)] = m.match_hometeam_name; T[String(m.match_awayteam_id)] = m.match_awayteam_name; });

  const avg = gp ? gf / gp : 1.3;
  const teams = Object.keys(T).map(id => {
    const rec = (recent[id] || []).slice(-8);
    const mixF = rec.reduce((s, m) => s + (m.xf == null ? m.f : .5 * m.f + .5 * m.xf), 0);
    const mixA = rec.reduce((s, m) => s + (m.xa == null ? m.a : .5 * m.a + .5 * m.xa), 0);
    let a = (mixF + K_CUP * avg) / (rec.length + K_CUP) / avg;
    let d = (mixA + K_CUP * avg) / (rec.length + K_CUP) / avg;
    const dom = domTeam[id];
    if (dom) {
      // conosciamo la squadra da un campionato che seguiamo: la mescoliamo col suo rendimento lì,
      // corretto per la forza del campionato, dando più peso alla coppa quando ha giocato più partite lì
      const f = STRENGTH[String(domCountry[id]).toLowerCase()] || .85;
      const wCup = Math.min(1, rec.length / 6);
      a = wCup * a + (1 - wCup) * dom.a * f;
      d = wCup * d + (1 - wCup) * dom.d / f;
    }
    const f5 = (form[id] || []).slice(-5); while (f5.length < 5) f5.unshift('N');
    const ab = dom ? { att: dom.absAtt, def: dom.absDef, list: dom.absList } : null;
    return {
      id, name: T[id], crest: dom ? dom.crest : null, played: rec.length,
      a, d, ah: a, dh: d, aa: a, da: d, form: f5,
      absAtt: ab ? ab.att : null, absDef: ab ? ab.def : null, absList: ab ? ab.list : null,
      lowData: rec.length < 3, league: dom ? domCountry[id] : null
    };
  });

  const pm = predMap(preds);
  const lastCopy = Object.assign({}, last);
  const fixtures = ev.filter(isUpcoming).sort((a, b) => stamp(a) - stamp(b)).slice(0, 14)
    .map(m => makeFixture(m, lastCopy, P, pm));

  return {
    updated: new Date().toISOString(), season: seasonYear(), cup: true,
    league: { id: cup.id, name: cup.name, country: 'Europa' },
    played: teams.length ? Math.round(teams.reduce((s, t) => s + t.played, 0) / teams.length) : 0,
    lg: { h: avg, a: avg, base: { h: .42, d: .25, a: .33 } },
    teams, fixtures, _results: results, _last: last, _players: P
  };
}
module.exports = { buildCup };
