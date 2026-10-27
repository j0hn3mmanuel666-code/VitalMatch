import fs from 'node:fs/promises';
import path from 'node:path';

const raw = (process.argv[2] || process.env.CAPACITOR_SERVER_URL || '').trim();
if (!raw) {
  console.error('Usage: node scripts/set-capacitor-url.mjs <https-url>');
  console.error('   or: set CAPACITOR_SERVER_URL=https://app.example.com and run again');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(raw);
} catch {
  console.error(`Invalid URL: ${raw}`);
  process.exit(1);
}
if (!['http:', 'https:'].includes(parsed.protocol)) {
  console.error('The server URL must use http:// or https://');
  process.exit(1);
}

const configPath = path.resolve('capacitor.config.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
config.server = {
  ...(config.server || {}),
  url: parsed.origin,
  cleartext: parsed.protocol === 'http:',
};
await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Capacitor server URL set to ${parsed.origin} (cleartext: ${config.server.cleartext})`);
