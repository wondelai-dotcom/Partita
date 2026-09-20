// Operazione giornaliera (Vercel Cron): salva le previsioni delle prossime partite e registra i risultati
const { listLeagues, hasRedis, redis, redisPipe } = require('./_common');
const { buildLeague } = require('./_league');
const { buildCup } = require('./_cup');
const { readAll } = require('./_track');
const Model = require('../public/model.js');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'Manca la variabile CRON_SECRET' });
  if (req.headers.authorization !== 'Bearer ' + secret) return res.status(401).json({ error: 'Non autorizzato' });
  if (!hasRedis()) return res.status(501).json({ error: 'Database non collegato' });
  try {
    const now = Date.now();
    const stored = await readAll();
    const byId = {}; stored.forEach(r => { byId[r.id] = r; });
    const cmds = []; let saved = 0, resolved = 0;
    const leagues = await listLeagues();
    for (const l of leagues) {
      let d;
      try { d = l.kind === 'cup' ? await buildCup(l) : await buildLeague(l.id); } catch (_) { continue; }
      const T = {}, ID = {};
      d.teams.forEach(t => { T[t.name] = t; ID[t.id] = t.name; });
      const ctx = { T, K: {}, LG: d.lg, bias: null }; // si salva la previsione senza correzione automatica
      // 1) previsioni per le partite dei prossimi 3 giorni (ancora non iniziate)
      for (const f of d.fixtures) {
        const t = new Date(f.date).getTime();
        if (!(t > now && t < now + 3 * 864e5)) continue;
        const h = ID[f.home], a = ID[f.away]; if (!h || !a) continue;
        const r = Model.analyze(ctx, h, a, Model.fixtureOpts(ctx, f, h, a), f.pred, true);
        const rec = { id: f.id, lg: l.name, date: f.date, home: f.home, away: f.away, hn: h, an: a, pH: r.pH, pD: r.pD, pA: r.pA, o25: r.o25, btts: r.btts, res: null };
        cmds.push(['HSET', 'pred', f.id, JSON.stringify(rec)]); saved++;
      }
      // 2) risultati delle partite già salvate
      for (const [id, sc] of Object.entries(d._results || {})) {
        const rec = byId[id];
        if (rec && !rec.res) { rec.res = sc; cmds.push(['HSET', 'pred', id, JSON.stringify(rec)]); resolved++; }
      }
    }
    for (let i = 0; i < cmds.length; i += 50) await redisPipe(cmds.slice(i, i + 50));
    res.status(200).json({ saved, resolved, total: stored.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
