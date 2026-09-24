const { tGet, num, ymd } = require('./_tennis');

let rankCache = null;
async function rankings() {
  if (rankCache && Date.now() - rankCache.t < 6 * 60 * 60 * 1000) return rankCache.v;
  const [atp, wta] = await Promise.all([
    tGet({ method: 'get_standings', event_type: 'ATP' }).catch(() => []),
    tGet({ method: 'get_standings', event_type: 'WTA' }).catch(() => [])
  ]);
  const v = {};
  [...atp, ...wta].forEach(r => { v[String(r.player_key)] = { rank: num(r.place), points: num(r.points), country: r.country, tour: r.league }; });
  rankCache = { t: Date.now(), v };
  return v;
}

module.exports = async (req, res) => {
  try {
    const id = String(req.query.id || '').replace(/\D/g, '');
    const etk = String(req.query.et || '').replace(/\D/g, '');
    const surface = req.query.surface || '';
    if (!id) return res.status(400).json({ error: 'Parametro id mancante' });
    const now = new Date();
    const from = ymd(new Date(now.getTime() - 14 * 864e5)), to = ymd(new Date(now.getTime() + 30 * 864e5));
    const params = { method: 'get_fixtures', date_start: from, date_stop: to, tournament_key: id };
    if (etk) params.event_type_key = etk;
    const [ev, rk] = await Promise.all([tGet(params), rankings().catch(() => ({}))]);
    if (!ev.length) { const e = new Error('Nessuna partita trovata per questo torneo nel periodo considerato'); e.status = 502; throw e; }

    const players = {};
    const addP = (key, name) => { if (!players[key]) players[key] = { id: key, name, rank: (rk[key] || {}).rank || null, points: (rk[key] || {}).points || null }; };
    const results = {};
    ev.forEach(m => {
      const a = String(m.first_player_key), b = String(m.second_player_key);
      addP(a, m.event_first_player); addP(b, m.event_second_player);
      if (m.event_status === 'Finished' && m.event_winner) results[String(m.event_key)] = m.event_winner === 'First Player' ? [1, 0] : [0, 1];
    });
    const fixtures = ev
      .filter(m => !m.event_status || m.event_status === '' || m.event_status === 'Not Started')
      .sort((x, y) => (x.event_date + x.event_time).localeCompare(y.event_date + y.event_time))
      .slice(0, 24)
      .map(m => ({
        id: String(m.event_key), a: String(m.first_player_key), b: String(m.second_player_key),
        date: m.event_date + 'T' + (m.event_time || '00:00') + ':00', round: m.tournament_round || ''
      }));
    const played = ev.filter(m => m.event_status === 'Finished').map(m => ({
      id: String(m.event_key), a: String(m.first_player_key), b: String(m.second_player_key),
      score: m.event_final_result, winner: m.event_winner, date: m.event_date, round: m.tournament_round || ''
    }));

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.status(200).json({
      updated: new Date().toISOString(), tournament: { id, name: ev[0].tournament_name, surface },
      players: Object.values(players), fixtures, played
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};
