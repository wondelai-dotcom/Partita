// Commento scritto da un'AI (Claude), generato solo su richiesta.
// Usa la funzione di ricerca sul web integrata nell'API di Claude per trovare
// notizie recenti (infortuni dell'ultima ora, cambi di formazione, contesto) oltre ai dati che già abbiamo.
const crypto = require('crypto');
const { hasRedis, redis } = require('./_common');

const MODEL = 'claude-haiku-4-5-20251001';
const cap = () => parseInt(process.env.AI_DAILY_CAP || '150', 10);
const maxSearches = () => parseInt(process.env.AI_MAX_SEARCHES || '4', 10);
let localCount = { day: '', n: 0 };

const str = (v, max = 40) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').slice(0, max);
const pc = v => Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 100);
const arr = (v, n = 6) => (Array.isArray(v) ? v : []).slice(0, n).map(x => str(x, 60));

function buildFootball(b) {
  const d = {
    league: str(b.league), home: str(b.home), away: str(b.away),
    pH: pc(b.pH), pD: pc(b.pD), pA: pc(b.pA), o25: pc(b.o25), btts: pc(b.btts),
    lh: (Number(b.lh) || 0).toFixed(2), la: (Number(b.la) || 0).toFixed(2),
    top: str(b.top, 20), rel: str(b.rel, 10), formH: arr(b.formH, 5).join(''), formA: arr(b.formA, 5).join(''),
    absH: arr(b.absH), absA: arr(b.absA), cup: !!b.cup, nation: !!b.nation, why: arr(b.why, 5)
  };
  if (!d.home || !d.away) return null;
  const system = "Sei un analista di calcio che scrive in italiano per un sito di analisi prepartita. Usa i dati forniti come base, e la ricerca sul web SOLO per trovare notizie recenti e verificabili (infortuni, squalifiche, formazioni, contesto) che possano confermare o correggere quei dati: non inventare nulla che non risulti dai dati o dalla ricerca. Se cerchi sul web, preferisci fonti sportive affidabili e recenti. Scrivi 4-6 frasi in prosa, senza elenchi né markdown. Spiega perché il modello indica quelle probabilità, cita i fattori più importanti (inclusa qualunque notizia recente rilevante trovata) e ricorda in modo naturale che il calcio resta imprevedibile. Non dare consigli di giocata, non citare quote né scommesse.";
  const user = `Competizione: ${d.league}${d.cup ? ' (coppa europea, valori stimati fra campionati diversi)' : ''}${d.nation ? ' (nazionali: pochissime partite disponibili fra loro, stima meno solida)' : ''}
Partita: ${d.home} (casa) - ${d.away} (trasferta)
Probabilità: vittoria ${d.home} ${d.pH}%, pareggio ${d.pD}%, vittoria ${d.away} ${d.pA}%
Gol attesi: ${d.lh} per ${d.home}, ${d.la} per ${d.away}. Risultato più probabile: ${d.top}
Più di 2,5 gol: ${d.o25}%. Segnano entrambe: ${d.btts}%
Forma recente (V vittoria, N pareggio, P sconfitta): ${d.home} ${d.formH}, ${d.away} ${d.formA}
Assenze ${d.home}: ${d.absH.join('; ') || 'nessuna segnalata'}
Assenze ${d.away}: ${d.absA.join('; ') || 'nessuna segnalata'}
Affidabilità dei dati: ${d.rel}
Note del modello: ${d.why.join(' ')}
Se lo ritieni utile, cerca sul web notizie delle ultime ore su ${d.home} e ${d.away} (formazioni, infortuni, dichiarazioni) prima di scrivere.`;
  return { d, system, user };
}

function buildTennis(b) {
  const d = {
    tournament: str(b.tournament), a: str(b.a), bName: str(b.b),
    pA: pc(b.pA), pB: pc(b.pB), rankA: str(b.rankA, 30), rankB: str(b.rankB, 30),
    surface: str(b.surface, 20), why: arr(b.why, 5), h2h: str(b.h2h, 60)
  };
  if (!d.a || !d.bName) return null;
  const system = "Sei un analista di tennis che scrive in italiano per un sito di analisi prepartita. Usa i dati forniti come base, e la ricerca sul web SOLO per trovare notizie recenti e verificabili (condizioni fisiche, forma, ritiri, dichiarazioni) che possano confermare o correggere quei dati: non inventare nulla che non risulti dai dati o dalla ricerca. Scrivi 4-6 frasi in prosa, senza elenchi né markdown. Spiega perché il modello indica quella probabilità, citando i fattori più importanti, e ricorda in modo naturale che il tennis resta imprevedibile. Non dare consigli di giocata, non citare quote né scommesse.";
  const user = `Torneo: ${d.tournament}${d.surface ? ' (superficie: ' + d.surface + ')' : ''}
Match: ${d.a} contro ${d.bName}
Probabilità: ${d.a} ${d.pA}%, ${d.bName} ${d.pB}%
Classifica: ${d.a} ${d.rankA || 'non disponibile'}, ${d.bName} ${d.rankB || 'non disponibile'}
Scontri diretti: ${d.h2h || 'nessuno disponibile'}
Note del modello: ${d.why.join(' ')}
Se lo ritieni utile, cerca sul web notizie delle ultime ore su ${d.a} e ${d.bName} (condizioni fisiche, forma, eventuali ritiri) prima di scrivere.`;
  return { d, system, user };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(501).json({ error: 'Commenti AI non attivi' });
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const built = b.sport === 'tennis' ? buildTennis(b) : buildFootball(b);
    if (!built) return res.status(400).json({ error: 'Dati mancanti' });
    const { d, system, user } = built;

    // limite giornaliero per tenere sotto controllo i costi (ogni commento può includere più ricerche sul web)
    const day = new Date().toISOString().slice(0, 10), ckey = 'ai:count:' + day;
    if (hasRedis()) {
      const n = await redis(['INCR', ckey]);
      if (n === 1) await redis(['EXPIRE', ckey, 172800]);
      if (n > cap()) return res.status(429).json({ error: 'Limite giornaliero di commenti raggiunto: riprova domani' });
    } else {
      if (localCount.day !== day) localCount = { day, n: 0 };
      if (++localCount.n > cap()) return res.status(429).json({ error: 'Limite giornaliero di commenti raggiunto: riprova domani' });
    }
    // stessa partita e stessi numeri = stesso commento, senza nuova spesa (niente ricerche ripetute)
    const sig = crypto.createHash('sha1').update(JSON.stringify(d)).digest('hex');
    const cacheKey = 'ai:txt:' + sig;
    if (hasRedis()) { const c = await redis(['GET', cacheKey]); if (c) return res.status(200).json(JSON.parse(c)); }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 900, system, messages: [{ role: 'user', content: user }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches() }]
      })
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'Servizio AI non disponibile' + (j && j.error && j.error.message ? ': ' + j.error.message : '') });
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    if (!text) return res.status(502).json({ error: 'Risposta vuota dal servizio AI' });
    // fonti citate dalla ricerca (se il modello ha cercato sul web)
    const seen = new Set(), sources = [];
    (j.content || []).filter(c => c.type === 'text' && c.citations).forEach(c => c.citations.forEach(ci => {
      if (ci.url && !seen.has(ci.url)) { seen.add(ci.url); sources.push({ url: ci.url, title: ci.title || ci.url }); }
    }));
    const searched = !!(j.usage && j.usage.server_tool_use && j.usage.server_tool_use.web_search_requests);
    const payload = { text, sources: sources.slice(0, 6), searched };
    if (hasRedis()) await redis(['SET', cacheKey, JSON.stringify(payload), 'EX', 21600]);
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
