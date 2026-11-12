// Read-only configuration diagnostic. Presence does not prove a provider key is valid.
const { hasRedis } = require('./_common');

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Metodo non consentito' });
  }

  const configuration = {
    footballProviderKeyPresent: !!process.env.APIFOOTBALL_KEY,
    tennisProviderKeyPresent: !!process.env.TENNIS_API_KEY,
    redisConfigured: hasRedis(),
    cronSecretPresent: !!process.env.CRON_SECRET,
    aiProviderKeyPresent: !!process.env.ANTHROPIC_API_KEY
  };
  const configured = configuration.footballProviderKeyPresent;

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(configured ? 200 : 503).json({
    status: configured ? 'configured' : 'missing_configuration',
    configured,
    configuration,
    note: 'La presenza delle variabili non verifica validità, quota o raggiungibilità dei provider.',
    checkedAt: new Date().toISOString()
  });
};
