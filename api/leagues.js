const { listLeagues } = require('./_common');

module.exports = async (req, res) => {
  try {
    const leagues = await listLeagues();
    if (!leagues.length) {
      const e = new Error('Nessun campionato principale incluso nel tuo piano APIfootball');
      e.status = 502;
      throw e;
    }
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ leagues });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};
