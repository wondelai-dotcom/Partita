'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const required = [
  'public/index.html', 'public/model.js', 'api/leagues.js', 'api/league.js',
  'api/cron.js', 'api/accuracy.js', 'api/commento.js', 'api/tennis-leagues.js',
  'api/tennis-tournament.js', 'api/tennis-h2h.js', 'api/health.js', 'vercel.json'
];

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function parseJavaScript(source, label) {
  try { new vm.Script(source, { filename: label }); }
  catch (error) { throw new Error(label + ': ' + error.message); }
}

for (const file of required) {
  assert(fs.existsSync(path.join(root, file)), 'File obbligatorio mancante: ' + file);
}

const config = JSON.parse(read('vercel.json'));
assert(config.outputDirectory === 'public', 'Vercel deve pubblicare la cartella public');
assert(config.functions && config.functions['api/*.js'], 'Configurazione delle funzioni API mancante');
assert(Array.isArray(config.crons) && config.crons.some(job => job.path === '/api/cron'), 'Cron giornaliero non configurato');
const headers = (config.headers || []).flatMap(rule => rule.headers || []);
for (const key of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy']) {
  assert(headers.some(header => header.key.toLowerCase() === key.toLowerCase()), 'Security header mancante: ' + key);
}

const apiDir = path.join(root, 'api');
for (const file of fs.readdirSync(apiDir).filter(name => name.endsWith('.js'))) {
  parseJavaScript(read(path.join('api', file)), path.join('api', file));
}
parseJavaScript(read('public/model.js'), 'public/model.js');

const html = read('public/index.html');
const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
assert(inlineScripts.length > 0, 'Nessuno script inline trovato in public/index.html');
inlineScripts.forEach((match, index) => {
  const source = match[1].trim();
  if (source) parseJavaScript(source, 'public/index.html#script-' + (index + 1));
});

const cron = read('api/cron.js');
assert(cron.includes('process.env.CRON_SECRET'), 'Cron non verifica CRON_SECRET');
assert(cron.includes("req.headers.authorization !== 'Bearer ' + secret"), 'Cron non verifica il bearer token');
assert(cron.includes('hasRedis()'), 'Cron non verifica Redis');

const ai = read('api/commento.js');
assert(ai.includes('!hasRedis()'), 'Endpoint AI deve rifiutare richieste senza Redis');
assert(ai.includes('AI_DAILY_CAP') && ai.includes('AI_IP_PER_MINUTE'), 'Limiti AI incompleti');

const health = read('api/health.js');
assert(!health.includes('process.env.APIFOOTBALL_KEY ||'), 'Health endpoint non deve restituire segreti');
assert(health.includes('footballProviderKeyPresent') && health.includes('configuration'), 'Health endpoint non espone lo stato delle configurazioni');

console.log('Release checks passed: required files, Vercel config, security headers, API syntax, browser script syntax, cron and AI guards.');
