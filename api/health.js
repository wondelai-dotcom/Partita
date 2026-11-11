// Read-only readiness endpoint. Never returns secret values or provider responses.
const { hasRedis } = require('./_common');

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Metodo non consentito' });
  }

  const services = {
    football: !!process.env.APIFOOTBALL_KEY,
    tennis: !!process.env.TENNIS_API_KEY,
    accuracy: hasRedis(),
    cron: !!process.env.CRON_SECRET && hasRedis(),
    ai: !!process.env.ANTHROPIC_API_KEY && hasRedis()
  };
  const ready = services.football;

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'degraded',
    ready,
    services,
    checkedAt: new Date().toISOString()
  });
};
