const { tGet, num } = require('./_tennis');

// Rendimento per superficie: somma le ultime 3 stagioni disponibili dal profilo giocatore (solo singolare)
function surfaceStats(prof) {
  const out = { hard: [0, 0], clay: [0, 0], grass: [0, 0] };
  if (!prof || !prof.stats) return out;
  const seasons = prof.stats.filter(s => s.type === 'singles').sort((a, b) => String(b.season).localeCompare(String(a.season))).slice(0, 3);
  seasons.forEach(s => {
    out.hard[0] += num(s.hard_won); out.hard[1] += num(s.hard_lost);
    out.clay[0] += num(s.clay_won); out.clay[1] += num(s.clay_lost);
    out.grass[0] += num(s.grass_won); out.grass[1] += num(s.grass_lost);
  });
  return out;
}
function recentForm(prof) {
  if (!prof || !prof.stats) return null;
  const s = prof.stats.filter(x => x.type === 'singles').sort((a, b) => String(b.season).localeCompare(String(a.season)))[0];
  if (!s) return null;
  const w = num(s.matches_won), l = num(s.matches_lost);
  return (w + l) ? { w, l, rate: w / (w + l) } : null;
}

module.exports = async (req, res) => {
  const a = String(req.query.a || '').replace(/\D/g, ''), b = String(req.query.b || '').replace(/\D/g, '');
  if (!a || !b) return res.status(400).json({ error: 'Parametri a e b mancanti' });
  try {
    const [h2h, pa, pb] = await Promise.all([
      tGet({ method: 'get_H2H', first_player_key: a, second_player_key: b }).catch(() => ({ H2H: [] })),
      tGet({ method: 'get_players', player_key: a }).catch(() => []),
      tGet({ method: 'get_players', player_key: b }).catch(() => [])
    ]);
    const list = (h2h && h2h.H2H) || [];
    const matches = list.filter(m => m.event_status === 'Finished' && m.event_winner)
      .sort((x, y) => String(y.event_date).localeCompare(String(x.event_date))).slice(0, 10)
      .map(m => ({ date: m.event_date, tournament: m.tournament_name, result: m.event_final_result, aWon: (m.first_player_key === a) === (m.event_winner === 'First Player') }));
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=21600');
    res.status(200).json({
      matches,
      surfaceA: surfaceStats(pa[0]), surfaceB: surfaceStats(pb[0]),
      formA: recentForm(pa[0]), formB: recentForm(pb[0])
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};
