const { redis, hasRedis } = require('./_common');

async function readAll() {
  if (!hasRedis()) return null;
  const flat = await redis(['HGETALL', 'pred']);
  const out = [];
  for (let i = 0; i + 1 < (flat || []).length; i += 2) { try { out.push(JSON.parse(flat[i + 1])); } catch (_) {} }
  return out;
}

const outcome = r => { const [x, y] = r.res; return { h: x > y ? 1 : 0, d: x === y ? 1 : 0, a: x < y ? 1 : 0, o25: x + y > 2 ? 1 : 0, btts: x > 0 && y > 0 ? 1 : 0 }; };

function summarize(recs) {
  const done = recs.filter(r => r.res), n = done.length;
  const out = { enabled: true, n, pending: recs.length - n, byLeague: [], bins: [], recent: [] };
  if (!n) return out;
  let hit = 0, br = 0, ll = 0; const fr = { h: 0, d: 0, a: 0 }, pm = { h: 0, d: 0, a: 0, o25: 0, btts: 0 }, am = { o25: 0, btts: 0 };
  for (const r of done) {
    const y = outcome(r);
    const arg = r.pH >= r.pD && r.pH >= r.pA ? 'h' : r.pD >= r.pA ? 'd' : 'a';
    if (y[arg]) hit++;
    br += (r.pH - y.h) ** 2 + (r.pD - y.d) ** 2 + (r.pA - y.a) ** 2;
    ll += -Math.log(Math.max(1e-6, y.h ? r.pH : y.d ? r.pD : r.pA));
    fr.h += y.h; fr.d += y.d; fr.a += y.a;
    pm.h += r.pH; pm.d += r.pD; pm.a += r.pA; pm.o25 += r.o25; pm.btts += r.btts; am.o25 += y.o25; am.btts += y.btts;
  }
  const f = { h: fr.h / n, d: fr.d / n, a: fr.a / n };
  let brBase = 0;
  for (const r of done) { const y = outcome(r); brBase += (f.h - y.h) ** 2 + (f.d - y.d) ** 2 + (f.a - y.a) ** 2; }
  Object.assign(out, { hit: hit / n, brier: br / n, brierBase: brBase / n, logloss: ll / n, freq: f });
  const edges = [0, .2, .35, .5, .65, 1.01];
  for (let i = 0; i < edges.length - 1; i++) {
    const g = done.filter(r => r.pH >= edges[i] && r.pH < edges[i + 1]);
    if (g.length) out.bins.push({ lo: edges[i], hi: Math.min(1, edges[i + 1]), n: g.length, pred: g.reduce((s, r) => s + r.pH, 0) / g.length, act: g.reduce((s, r) => s + outcome(r).h, 0) / g.length });
  }
  const bl = {};
  done.forEach(r => { bl[r.lg] = (bl[r.lg] || 0) + 1; });
  out.byLeague = Object.entries(bl).map(([name, c]) => ({ name, n: c }));
  out.recent = done.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12)
    .map(r => ({ home: r.hn, away: r.an, date: r.date, res: r.res, pH: r.pH, pD: r.pD, pA: r.pA }));
  // correzione automatica: solo con un campione ampio, e solo per metà dello scostamento
  if (n >= 150) {
    const cl = v => Math.max(-.03, Math.min(.03, v));
    out.bias = {
      h: cl(.5 * (fr.h / n - pm.h / n)), d: cl(.5 * (fr.d / n - pm.d / n)), a: cl(.5 * (fr.a / n - pm.a / n)),
      o25: cl(.5 * (am.o25 / n - pm.o25 / n)), btts: cl(.5 * (am.btts / n - pm.btts / n))
    };
  } else out.bias = null;
  return out;
}

let biasCache = null;
async function getBias() {
  if (!hasRedis()) return { bias: null, n: 0 };
  if (biasCache && Date.now() - biasCache.t < 30 * 60 * 1000) return biasCache.v;
  let v = { bias: null, n: 0 };
  try { const s = summarize(await readAll()); v = { bias: s.bias, n: s.n }; } catch (_) {}
  biasCache = { t: Date.now(), v };
  return v;
}

module.exports = { readAll, summarize, getBias };
