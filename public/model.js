// Modello statistico condiviso: gira sia nel browser sia sul server (tracciamento previsioni)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Model = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function formFactor(f) {
    const pts = f.reduce((s, c) => s + (c === 'V' ? 3 : c === 'N' ? 1 : 0), 0);
    return 1 + (pts - 7) / 7 * 0.04;
  }
  function pois(l, n) { const p = [Math.exp(-l)]; for (let k = 1; k <= n; k++) p.push(p[k - 1] * l / k); return p; }

  // ctx = { T: squadre per nome, K: correzioni manuali per nome, LG: medie del campionato, bias: correzione automatica }
  function core(ctx, h, a, o) {
    const H = ctx.T[h], A = ctx.T[a], kh = ctx.K[h] || { a: 1, d: 1 }, ka = ctx.K[a] || { a: 1, d: 1 }, LG = ctx.LG, w = .5;
    const ha = o.ha / 100, nb = (LG.h + LG.a) / 2;
    const baseH = nb * Math.pow(LG.h / nb, ha), baseA = nb * Math.pow(LG.a / nb, ha);
    const attH = (w * H.ah + (1 - w) * H.a) * kh.a, defA = (w * A.da + (1 - w) * A.d) * ka.d;
    const attA = (w * A.aa + (1 - w) * A.a) * ka.a, defH = (w * H.dh + (1 - w) * H.d) * kh.d;
    const fH = formFactor(o.fH), fA = formFactor(o.fA);
    // assenze: valori pesati se disponibili, altrimenti conteggio manuale
    const iaH = o.absH ? o.absH.att : Math.pow(.96, o.iH), iaA = o.absA ? o.absA.att : Math.pow(.96, o.iA);
    const idH = o.absH ? o.absH.def : Math.pow(1.03, o.iH), idA = o.absA ? o.absA.def : Math.pow(1.03, o.iA);
    const rH = (o.restH != null && o.restH <= 3) ? .97 : 1, rA = (o.restA != null && o.restA <= 3) ? .97 : 1;
    let lh = baseH * attH * defA * idA * fH * iaH * rH, la = baseA * attA * defH * idH * fA * iaA * rA;
    lh = Math.min(4, Math.max(.2, lh)); la = Math.min(4, Math.max(.2, la));
    const N = 9, ph = pois(lh, N), pa = pois(la, N), rho = -.08, g = []; let tot = 0;
    for (let x = 0; x <= N; x++) { g[x] = []; for (let y = 0; y <= N; y++) {
      let t = 1;
      if (x === 0 && y === 0) t = 1 - lh * la * rho; else if (x === 0 && y === 1) t = 1 + lh * rho;
      else if (x === 1 && y === 0) t = 1 + la * rho; else if (x === 1 && y === 1) t = 1 - rho;
      const v = ph[x] * pa[y] * t; g[x][y] = v; tot += v; } }
    let pH = 0, pD = 0, pA = 0, o15 = 0, o25 = 0, o35 = 0, btts = 0; const list = [];
    for (let x = 0; x <= N; x++) for (let y = 0; y <= N; y++) {
      const v = g[x][y] / tot; g[x][y] = v;
      if (x > y) pH += v; else if (x === y) pD += v; else pA += v;
      if (x + y > 1) o15 += v; if (x + y > 2) o25 += v; if (x + y > 3) o35 += v; if (x > 0 && y > 0) btts += v;
      list.push([x, y, v]);
    }
    list.sort((p, q) => q[2] - p[2]);
    return { lh, la, g, pH, pD, pA, o15, o25, o35, btts, top: list.slice(0, 5), attH, attA, defH, defA, fH, fA, iaH, iaA, idH, idA, rH, rA };
  }

  // Probabilità finali: modello + avvicinamento alle frequenze del campionato + secondo modello + correzione automatica
  function analyze(ctx, h, a, o, pred, useApi) {
    const c = core(ctx, h, a, o), s = .08, b = ctx.LG.base || { h: .45, d: .26, a: .29 };
    let pH = (1 - s) * c.pH + s * b.h, pD = (1 - s) * c.pD + s * b.d, pA = (1 - s) * c.pA + s * b.a, o25 = c.o25, btts = c.btts, used = false;
    if (pred && useApi) {
      const w = .3;
      pH = (1 - w) * pH + w * pred.h; pD = (1 - w) * pD + w * pred.d; pA = (1 - w) * pA + w * pred.a;
      o25 = (1 - w) * o25 + w * pred.o25; btts = (1 - w) * btts + w * pred.btts; used = true;
    }
    const pre = { pH, pD, pA, o25, btts };
    let biasOn = false;
    if (ctx.bias) {
      biasOn = true;
      pH += ctx.bias.h; pD += ctx.bias.d; pA += ctx.bias.a; o25 += ctx.bias.o25; btts += ctx.bias.btts;
      pH = Math.max(.01, pH); pD = Math.max(.01, pD); pA = Math.max(.01, pA);
      o25 = Math.min(.98, Math.max(.02, o25)); btts = Math.min(.98, Math.max(.02, btts));
    }
    const sum = pH + pD + pA; pH /= sum; pD /= sum; pA /= sum;
    return Object.assign(c, { pH, pD, pA, o25, btts, used, biasOn, pre, raw: { pH: c.pH, pD: c.pD, pA: c.pA, o25: c.o25, btts: c.btts } });
  }

  // Impostazioni di una partita in calendario (forma, assenze, riposo)
  function fixtureOpts(ctx, f, H, A) {
    const th = ctx.T[H], ta = ctx.T[A];
    const ab = (t, side) => (f.abs && f.abs[side]) ? f.abs[side] : (t.absAtt != null ? { att: t.absAtt, def: t.absDef, list: t.absList || [] } : null);
    return { fH: th.form, fA: ta.form, iH: 0, iA: 0, absH: ab(th, 'h'), absA: ab(ta, 'a'), ha: 100, restH: f.restH, restA: f.restA };
  }

  return { formFactor, pois, core, analyze, fixtureOpts };
});
