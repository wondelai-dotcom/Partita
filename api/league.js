const { checkedLeague } = require('./_common');
const { buildLeague, publicView } = require('./_league');
const { buildCup } = require('./_cup');
const { getBias } = require('./_track');

module.exports = async (req, res) => {
  try {
    const L = await checkedLeague(req.query.id);
    const d = L.kind === 'cup' ? await buildCup(L) : await buildLeague(L.id);
    const b = await getBias();
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    res.status(200).json(Object.assign(publicView(d), { bias: b.bias, biasN: b.n }));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};
