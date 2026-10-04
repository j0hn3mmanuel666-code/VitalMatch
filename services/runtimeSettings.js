import fs from 'node:fs';
import { promises as fsAsync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const DEFAULT_SETTINGS = Object.freeze({
  general: { appName: 'VitalMatch', systemStatus: 'online', timeZone: 'Asia/Manila' },
  email: { smtpServer: '', smtpPort: 587, emailEncryption: 'tls', fromEmail: '', emailUsername: '', emailPassword: '' },
  notifications: { emailNotificationsEnabled: true, bloodRequestNotifications: true, registrationNotifications: true, systemAlertNotifications: true },
  security: { sessionTimeout: 30, minPasswordLength: 8, requireSpecialChars: false }
});
const settingsFile = path.resolve(process.env.RUNTIME_SETTINGS_FILE || '.local/settings.json');
const legacyFile = path.resolve('settings.json');
let writeQueue = Promise.resolve();
const merge = data => Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([group, defaults]) => [group,
  Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, data?.[group]?.[key] ?? value]))
]));
function load() {
  const source = fs.existsSync(settingsFile) ? settingsFile : legacyFile;
  if (!fs.existsSync(source)) return merge({});
  return merge(JSON.parse(fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '')));
}
let current = load();
export function getRuntimeSettings() { return structuredClone(current); }
export function safeRuntimeSettings() {
  const safe = getRuntimeSettings(); safe.email.emailPassword = '';
  safe.email.hasPassword = !!current.email.emailPassword || !!process.env.EMAIL_PASS;
  return safe;
}
// Serialize the full read/modify/write operation. Runtime deployment uses a
// single settings writer; unique temporary paths also protect concurrent tests.
export function updateRuntimeSettings(updater, { commit } = {}) {
  const operation = writeQueue.then(async () => {
    const previous = getRuntimeSettings();
    const next = merge(await updater(structuredClone(previous)));
    await fsAsync.mkdir(path.dirname(settingsFile), { recursive: true });
    const temporary = `${settingsFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
    let published = false;
    const publish = async () => {
      if (published) throw new Error('Settings were already published');
      await fsAsync.writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
      await fsAsync.rename(temporary, settingsFile); published = true;
    };
    try {
      if (commit) await commit(next, previous, publish);
      else await publish();
      if (!published) throw new Error('Settings publication was not completed');
      current = next;
    } catch (error) {
      if (published) {
        try {
          await fsAsync.writeFile(temporary, JSON.stringify(previous, null, 2), { mode: 0o600 });
          await fsAsync.rename(temporary, settingsFile);
        } catch { throw new Error('Settings rollback failed; keep the service offline and restore the private configuration from backup'); }
      }
      throw error;
    } finally { await fsAsync.rm(temporary, { force: true }); }
    return getRuntimeSettings();
  });
  writeQueue = operation.catch(() => {}); return operation;
}
