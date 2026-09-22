// Diagnostica: mostra cosa restituisce APIfootball per un campionato (non espone la chiave)
const { afGet, listLeagues, ymd } = require('./_common');

module.exports = async (req, res) => {
  try {
    const list = await listLeagues();
    const L = list.find(l => l.id === String(req.query.id || '')) || list[0];
    const now = new Date();
    const out = { campionati: list.map(l => l.name + ' (' + l.id + ', stagione ' + l.season + ')'), scelto: L ? L.name : null };
    if (L) {
      const today = ymd(now), to = ymd(new Date(now.getTime() + 30 * 864e5));
      const fut = await afGet({ action: 'get_events', from: today, to, league_id: L.id }).catch(e => ({ errore: e.message }));
      if (Array.isArray(fut)) {
        out.eventi_futuri = fut.length;
        out.campione = fut.slice(0, 5).map(m => ({ data: m.match_date, ora: m.match_time, stato: m.match_status, casa: m.match_hometeam_name, trasferta: m.match_awayteam_name, punteggio: m.match_hometeam_score + '-' + m.match_awayteam_score }));
      } else out.eventi_futuri = fut;
      const wide = await afGet({ action: 'get_events', from: ymd(new Date(now.getTime() - 20 * 864e5)), to: today, league_id: L.id }).catch(e => ({ errore: e.message }));
      out.ultimi_20_giorni = Array.isArray(wide) ? wide.length : wide;
    }
    res.setHeader('Cache-Control', 's-maxage=60');
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
