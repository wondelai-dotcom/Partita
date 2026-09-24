// Scopre i tornei più importanti in corso o nei prossimi giorni (Slam, Masters 1000/WTA 1000, Finals),
// guardando il calendario reale invece di tenere un elenco fisso di ID che cambiano ogni stagione.
const { tGet, eventTypes, isMajor, surfaceOf, ymd } = require('./_tennis');

let cache = null;
module.exports = async (req, res) => {
  try {
    if (cache && Date.now() - cache.t < 3 * 60 * 60 * 1000) return send(res, cache.v);
    const et = await eventTypes();
    if (!et.atp && !et.wta) { const e = new Error('ATP/WTA singolare non trovati nel tuo piano API-Tennis'); e.status = 502; throw e; }
    const now = new Date();
    const from = ymd(new Date(now.getTime() - 7 * 864e5)), to = ymd(new Date(now.getTime() + 35 * 864e5));
    const types = [et.atp, et.wta].filter(Boolean);
    const lists = await Promise.all(types.map(t => tGet({ method: 'get_fixtures', date_start: from, date_stop: to, event_type_key: t }).catch(() => [])));
    const found = new Map();
    lists.forEach((list, i) => {
      const tour = types[i] === et.atp ? 'ATP' : 'WTA';
      (list || []).forEach(m => {
        const name = String(m.tournament_name || '');
        if (!isMajor(name)) return;
        const k = tour + ':' + m.tournament_key;
        if (!found.has(k)) found.set(k, { id: String(m.tournament_key), name: name + ' (' + tour + ')', tour, kind: 'tennis', eventTypeKey: types[i], surface: surfaceOf(name) });
      });
    });
    const v = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
    cache = { t: Date.now(), v };
    send(res, v);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};
function send(res, v) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=21600');
  res.status(200).json({ tournaments: v });
}
