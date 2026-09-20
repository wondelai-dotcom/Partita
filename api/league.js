const { afGet, checkedLeague, num, ymd, seasonYear } = require('./_common');

const K = 4;   // peso della media di campionato sul totale stagione
const K2 = 3;  // idem per casa/trasferta
const DONE = ['Finished', 'After ET', 'After Pen.'];
const stamp = m => new Date(m.match_date + 'T' + (m.match_time || '00:00') + ':00');
const names = arr => (arr || []).map(p => p.lineup_player || p.player_name || (typeof p === 'string' ? p : '')).filter(Boolean);

// Stima dei gol "meritati" dai tiri (i tiri in porta pesano di più)
function xgProxy(m) {
  const st = m.statistics || [];
  const f = t => st.find(x => x.type === t);
  const sot = f('Shots On Goal') || f('On Target');
  const tot = f('Shots Total');
  if (!sot || !tot) return null;
  const calc = (s, t) => 0.30 * s + 0.05 * Math.max(0, t - s);
  return [calc(num(sot.home), num(tot.home)), calc(num(sot.away), num(tot.away))];
}

module.exports = async (req, res) => {
  try {
    const L = await checkedLeague(req.query.id);
    const lid = L.id;
    const now = new Date();
    const from = ymd(new Date(now.getTime() - 75 * 864e5));
    const to = ymd(new Date(now.getTime() + 21 * 864e5));

    const st = await afGet({ action: 'get_standings', league_id: lid });
    if (!st.length) {
      const e = new Error('Classifica non disponibile per questo campionato');
      e.status = 502;
      throw e;
    }
    const ev = await afGet({ action: 'get_events', from, to, league_id: lid });
    let preds = [];
    try { preds = await afGet({ action: 'get_predictions', from: ymd(now), to, league_id: lid }); } catch (_) { preds = []; }

    // una riga per squadra
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
    const base = hp ? { h: hw / hp, d: hd / hp, a: hl / hp } : { h: 0.45, d: 0.26, a: 0.29 };

    // partite giocate (ultime settimane) con statistiche
    const finished = ev
      .filter(m => DONE.includes(m.match_status) && m.match_hometeam_score !== '' && m.match_awayteam_score !== '')
      .sort((a, b) => stamp(a) - stamp(b));
    const recent = {}, form = {}, last = {};
    for (const m of finished) {
      const x = num(m.match_hometeam_score), y = num(m.match_awayteam_score);
      const xg = xgProxy(m);
      const h = String(m.match_hometeam_id), a = String(m.match_awayteam_id);
      (recent[h] = recent[h] || []).push({ f: x, a: y, xf: xg ? xg[0] : null, xa: xg ? xg[1] : null });
      (recent[a] = recent[a] || []).push({ f: y, a: x, xf: xg ? xg[1] : null, xa: xg ? xg[0] : null });
      (form[h] = form[h] || []).push(x > y ? 'V' : x === y ? 'N' : 'P');
      (form[a] = form[a] || []).push(y > x ? 'V' : x === y ? 'N' : 'P');
      last[h] = stamp(m); last[a] = stamp(m);
    }

    const teams = [...rows.values()].map(r => {
      const id = String(r.team_id);
      const p = num(r.overall_league_payed), pH = num(r.home_league_payed), pA = num(r.away_league_payed);
      let a = (num(r.overall_league_GF) + K * avg) / (p + K) / avg;
      let d = (num(r.overall_league_GA) + K * avg) / (p + K) / avg;
      // ultime 6 partite: media tra gol reali e gol stimati dai tiri
      const rec = (recent[id] || []).slice(-6);
      if (rec.length) {
        const mixF = rec.reduce((s, m) => s + (m.xf == null ? m.f : 0.5 * m.f + 0.5 * m.xf), 0);
        const mixA = rec.reduce((s, m) => s + (m.xa == null ? m.a : 0.5 * m.a + 0.5 * m.xa), 0);
        const rA = (mixF + K * avg) / (rec.length + K) / avg;
        const rD = (mixA + K * avg) / (rec.length + K) / avg;
        const w = 0.3 * Math.min(1, rec.length / 4);
        a = (1 - w) * a + w * rA;
        d = (1 - w) * d + w * rD;
      }
      const f5 = (form[id] || []).slice(-5);
      while (f5.length < 5) f5.unshift('N');
      return {
        id, name: r.team_name, crest: r.team_badge || null, played: p,
        a, d,
        ah: (num(r.home_league_GF) + K2 * LGh) / (pH + K2) / LGh,
        dh: (num(r.home_league_GA) + K2 * LGa) / (pH + K2) / LGa,
        aa: (num(r.away_league_GF) + K2 * LGa) / (pA + K2) / LGa,
        da: (num(r.away_league_GA) + K2 * LGh) / (pA + K2) / LGh,
        form: f5
      };
    });

    // previsioni del fornitore, per partita
    const pm = {};
    (Array.isArray(preds) ? preds : []).forEach(x => {
      const h = num(x.prob_HW), d = num(x.prob_D), a = num(x.prob_AW);
      if (h + d + a > 0) pm[String(x.match_id)] = { h: h / 100, d: d / 100, a: a / 100, o25: num(x.prob_O) / 100, btts: num(x.prob_bts) / 100 };
    });

    // prossime partite con giorni di riposo, formazioni e assenti
    const upcoming = ev
      .filter(m => m.match_status === '' && m.match_hometeam_score === '')
      .sort((a, b) => stamp(a) - stamp(b))
      .slice(0, 14);
    const fixtures = upcoming.map(m => {
      const h = String(m.match_hometeam_id), a = String(m.match_awayteam_id);
      const when = stamp(m);
      const rest = t => last[t] ? Math.round((when - last[t]) / 864e5 * 10) / 10 : null;
      const restH = rest(h), restA = rest(a);
      last[h] = when; last[a] = when;
      const lu = m.lineup || {};
      const sh = lu.home && lu.home.starting_lineups, sa = lu.away && lu.away.starting_lineups;
      const hasLineup = !!((sh && sh.length) && (sa && sa.length));
      return {
        id: String(m.match_id), home: h, away: a,
        date: m.match_date + 'T' + (m.match_time || '00:00') + ':00',
        matchday: m.match_round, stadium: m.match_stadium || '', referee: m.match_referee || '',
        restH, restA, hasLineup,
        lineups: hasLineup ? { h: names(sh), a: names(sa), hs: m.match_hometeam_system || '', as: m.match_awayteam_system || '' } : null,
        miss: { h: names(lu.home && lu.home.missing_players), a: names(lu.away && lu.away.missing_players) },
        pred: pm[String(m.match_id)] || null
      };
    });

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    res.status(200).json({
      updated: new Date().toISOString(), season: seasonYear(),
      league: { id: L.id, name: L.name, country: L.country },
      played: Math.round(gp / 2),
      lg: { h: LGh, a: LGa, base },
      teams, fixtures
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};
