const { afGet, checkedLeague, num } = require('./_common');

// Stima le assenze: giocatori segnalati come infortunati che hanno giocato
// almeno il 40% delle partite del giocatore più utilizzato della squadra.
module.exports = async (req, res) => {
  try {
    const L = await checkedLeague(req.query.id);
    const T = await afGet({ action: 'get_teams', league_id: L.id });
    const out = {};
    for (const t of T) {
      const pl = t.players || [];
      const maxP = Math.max(0, ...pl.map(p => num(p.player_match_played)));
      const reg = pl.filter(p =>
        p.player_injured === 'Yes' && maxP > 0 && num(p.player_match_played) >= Math.max(1, 0.4 * maxP));
      out[String(t.team_key)] = { count: Math.min(3, reg.length), names: reg.map(p => p.player_name).slice(0, 6) };
    }
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.status(200).json({ injuries: out });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};
