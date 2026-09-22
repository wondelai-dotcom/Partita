// Diagnostica temporanea: NESSUN dato sensibile nella risposta, solo conteggi.
// Da rimuovere (o lasciare, è innocuo) una volta risolto il problema del calendario.
const { afGet, checkedLeague, ymd } = require('./_common');

module.exports = async (req, res) => {
  try {
    const L = await checkedLeague(req.query.id);
    const now = new Date();
    const from = ymd(new Date(now.getTime() - 75 * 864e5));
    const to = ymd(new Date(now.getTime() + 21 * 864e5));
    const ev = await afGet({ action: 'get_events', from, to, league_id: L.id });

    const byStatus = {};
    let noScore = 0, withScore = 0, futureDate = 0;
    const now2 = Date.now();
    const sample = [];
    for (const m of ev) {
      const st = JSON.stringify(m.match_status);
      byStatus[st] = (byStatus[st] || 0) + 1;
      const empty = (m.match_hometeam_score === '' || m.match_hometeam_score == null);
      if (empty) noScore++; else withScore++;
      const t = new Date(m.match_date + 'T' + (m.match_time || '00:00') + ':00').getTime();
      if (t > now2) futureDate++;
      if (empty && sample.length < 5) {
        sample.push({ date: m.match_date, time: m.match_time, status: m.match_status, home: m.match_hometeam_name, away: m.match_awayteam_name, hs: m.match_hometeam_score, as: m.match_awayteam_score });
      }
    }
    res.status(200).json({
      league: L.name, from, to, totalEvents: ev.length,
      countsByStatus: byStatus, noScore, withScore, futureDate,
      sampleUpcomingLike: sample
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};
