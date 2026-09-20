const { hasRedis } = require('./_common');
const { readAll, summarize } = require('./_track');

module.exports = async (req, res) => {
  try {
    if (!hasRedis()) return res.status(200).json({ enabled: false });
    const s = summarize(await readAll());
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    res.status(200).json(s);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
