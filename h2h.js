const { afGet, num } = require('./_common');

module.exports = async (req, res) => {
  const a = String(req.query.a || '').replace(/\D/g, '');
  const b = String(req.query.b || '').replace(/\D/g, '');
  if (!a || !b) return res.status(400).json({ error: 'Parametri a e b mancanti' });
  try {
    const d = await afGet({ action: 'get_H2H', firstTeamId: a, secondTeamId: b });
    const list = (d && d.firstTeam_VS_secondTeam) || [];
    const matches = list
      .filter(m => m.match_hometeam_score !== '' && m.match_awayteam_score !== '')
      .sort((x, y) => String(y.match_date).localeCompare(String(x.match_date)))
      .slice(0, 8)
      .map(m => ({
        date: m.match_date,
        homeId: String(m.match_hometeam_id), awayId: String(m.match_awayteam_id),
        home: m.match_hometeam_name, away: m.match_awayteam_name,
        hg: num(m.match_hometeam_score), ag: num(m.match_awayteam_score),
        league: m.league_name
      }));
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');
    res.status(200).json({ matches });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};
