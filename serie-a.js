const { afGet, serieAId, num, ymd, seasonYear } = require('./_common');

const K = 4; // peso della media di campionato: evita valori estremi a inizio stagione
const DONE = ['Finished', 'After ET', 'After Pen.'];

module.exports = async (req, res) => {
  try {
    const lid = await serieAId();
    const now = new Date();
    const from = ymd(new Date(now.getTime() - 60 * 864e5));
    const to = ymd(new Date(now.getTime() + 21 * 864e5));

    const st = await afGet({ action: 'get_standings', league_id: lid });
    if (!st.length) {
      const e = new Error('Classifica non disponibile per la Serie A');
      e.status = 502;
      throw e;
    }
    const ev = await afGet({ action: 'get_events', from, to, league_id: lid });

    // una riga per squadra
    const rows = new Map();
    st.forEach(r => { if (!rows.has(String(r.team_id))) rows.set(String(r.team_id), r); });

    let gf = 0, gp = 0, hgf = 0, hp = 0, agf = 0, ap = 0;
    rows.forEach(r => {
      gf += num(r.overall_league_GF); gp += num(r.overall_league_payed);
      hgf += num(r.home_league_GF); hp += num(r.home_league_payed);
      agf += num(r.away_league_GF); ap += num(r.away_league_payed);
    });
    const avg = gp ? gf / gp : 1.35;
    const league = { h: hp ? hgf / hp : 1.5, a: ap ? agf / ap : 1.2 };

    // forma: ultime 5 partite giocate
    const key = m => m.match_date + ' ' + (m.match_time || '00:00');
    const finished = ev
      .filter(m => DONE.includes(m.match_status) && m.match_hometeam_score !== '' && m.match_awayteam_score !== '')
      .sort((a, b) => key(a).localeCompare(key(b)));
    const res5 = {};
    for (const m of finished) {
      const x = num(m.match_hometeam_score), y = num(m.match_awayteam_score);
      const h = String(m.match_hometeam_id), a = String(m.match_awayteam_id);
      (res5[h] = res5[h] || []).push(x > y ? 'V' : x === y ? 'N' : 'P');
      (res5[a] = res5[a] || []).push(y > x ? 'V' : x === y ? 'N' : 'P');
    }

    const teams = [...rows.values()].map(r => {
      const p = num(r.overall_league_payed);
      const form = (res5[String(r.team_id)] || []).slice(-5);
      while (form.length < 5) form.unshift('N'); // partite mancanti = neutro
      return {
        id: String(r.team_id), name: r.team_name, crest: r.team_badge || null, played: p,
        att: (num(r.overall_league_GF) + K * avg) / (p + K) / avg,
        def: (num(r.overall_league_GA) + K * avg) / (p + K) / avg,
        form
      };
    });

    const fixtures = ev
      .filter(m => m.match_status === '' && m.match_hometeam_score === '')
      .sort((a, b) => key(a).localeCompare(key(b)))
      .slice(0, 10)
      .map(m => ({
        id: m.match_id, home: String(m.match_hometeam_id), away: String(m.match_awayteam_id),
        date: m.match_date + 'T' + (m.match_time || '00:00') + ':00', matchday: m.match_round
      }));

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    res.status(200).json({
      updated: new Date().toISOString(),
      season: seasonYear(),
      played: Math.round(gp / 2),
      league, teams, fixtures
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};
