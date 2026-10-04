import { getRuntimeSettings, safeRuntimeSettings, updateRuntimeSettings } from '../services/runtimeSettings.js';
import { emailService } from '../services/emailService.js';
import { AuditService } from '../services/auditService.js';
import { EmailOutbox } from '../models/emailOutboxModel.js';
import { emailOutboxSummary } from '../services/emailOutboxWorker.js';
import { CoordinationJob } from '../models/coordinationJobModel.js';
import { sequelize } from '../models/db.js';
import { fn, col } from 'sequelize';
const text = (v, max = 200) => typeof v === 'string' && v.length <= max ? v.trim() : null;
const boolean = v => v === true || v === 'true';
const fail = (res, error) => res.status(400).json({ success: false, error });
async function persist(req, group, values) {
  await updateRuntimeSettings(s => ({ ...s, [group]: { ...s[group], ...values } }), {
    commit: async (_next, previous, publish) => sequelize.transaction(async transaction => {
      await AuditService.logAction(req.session.userId, 'SETTINGS_UPDATE', 'RuntimeSettings', null, { group, ...previous[group] },
        { group, ...values, ...(group === 'email' ? { emailPassword: '[redacted]' } : {}) },
        { transaction, ipAddress: req.ip, userAgent: req.get('user-agent'), source: 'admin_settings' });
      await publish();
    })
  });
}
export const settingsPage = async (req, res) => res.render('admin-settings', {
  layout: 'admin', title: 'Admin Settings', user: req.session.user || {}, settingsData: safeRuntimeSettings()
});
export const getSettings = async (req, res) => {
  const rows = await CoordinationJob.findAll({ attributes:['status',[fn('COUNT',col('id')),'count']], group:['status'], raw:true });
  res.json({ success: true, settings: safeRuntimeSettings(), emailStatus: emailService.getStatus(), outboxStats: await emailOutboxSummary(), coordinationStats: Object.fromEntries(rows.map(r=>[r.status,Number(r.count)])) });
};
export const retryEmailOutbox = async (req, res) => {
  const count = await sequelize.transaction(async transaction => {
    const [count] = await EmailOutbox.update({ status: 'pending', attempts: 0, nextAttemptAt: new Date(), lockedAt: null }, { where: { status: 'failed' }, transaction });
    await AuditService.logAction(req.session.userId, 'EMAIL_RETRY', 'EmailOutboxes', null, null, { count }, { source: 'admin_settings', transaction });
    return count;
  });
  res.json({ success: true, message: `${count} failed message(s) queued for retry.` });
};
export const retryCoordinationJobs = async (req, res) => {
  const count = await sequelize.transaction(async transaction => {
    const [count] = await CoordinationJob.update({ status:'pending',attempts:0,nextAttemptAt:new Date(),lockedAt:null,lastError:null }, { where:{status:'failed'},transaction });
    await AuditService.logAction(req.session.userId,'COORDINATION_RETRY','CoordinationJobs',null,null,{count},{source:'admin_settings',transaction});
    return count;
  });
  res.json({success:true,message:`${count} failed coordination job(s) queued for retry. Only requests still approved and active will be contacted.`});
};
export const saveGeneralSettings = async (req, res) => {
  const appName = text(req.body.appName, 80), timeZone = text(req.body.timeZone, 80);
  if (!appName || !['online', 'maintenance', 'offline'].includes(req.body.systemStatus)) return fail(res, 'Enter a name and a valid system status.');
  try { new Intl.DateTimeFormat('en', { timeZone }).format(); } catch { return fail(res, 'Enter a valid time zone.'); }
  await persist(req, 'general', { appName, timeZone, systemStatus: req.body.systemStatus });
  await req.app.get('signalingServer')?.enforceOperatingStatus();
  res.json({ success: true, message: 'General settings saved.', settings: getRuntimeSettings().general });
};
export const saveEmailSettings = async (req, res) => {
  const smtpServer = text(req.body.smtpServer), fromEmail = text(req.body.fromEmail), emailUsername = text(req.body.emailUsername);
  const smtpPort = Number(req.body.smtpPort), emailEncryption = req.body.emailEncryption;
  if (!smtpServer || !/^[a-z0-9.-]+$/i.test(smtpServer) || !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535 ||
      !['tls', 'ssl'].includes(emailEncryption) || !fromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail) || !emailUsername) return fail(res, 'Provide a valid SMTP host, port, encrypted connection, sender and username.');
  const emailPassword = req.body.emailPassword;
  if (emailPassword !== undefined && (typeof emailPassword !== 'string' || emailPassword.length > 1000)) return fail(res, 'Invalid email password.');
  await persist(req, 'email', { smtpServer, smtpPort, emailEncryption, fromEmail, emailUsername, ...(emailPassword ? { emailPassword } : {}) });
  emailService.reconfigure();
  res.json({ success: true, message: 'SMTP settings saved. Verify the connection before relying on email delivery.', settings: safeRuntimeSettings().email });
};
export const saveNotificationSettings = async (req, res) => {
  const values = Object.fromEntries(['emailNotificationsEnabled', 'bloodRequestNotifications', 'registrationNotifications', 'systemAlertNotifications'].map(k => [k, boolean(req.body[k])]));
  await persist(req, 'notifications', values);
  res.json({ success: true, message: 'Notification settings saved.', settings: values });
};
export const saveSecuritySettings = async (req, res) => {
  const sessionTimeout = Number(req.body.sessionTimeout), minPasswordLength = Number(req.body.minPasswordLength);
  if (!Number.isInteger(sessionTimeout) || sessionTimeout < 5 || sessionTimeout > 480 || !Number.isInteger(minPasswordLength) || minPasswordLength < 8 || minPasswordLength > 64) return fail(res, 'Session timeout must be 5-480 minutes and password length 8-64 characters.');
  if (req.body.twoFactorAuth || req.body.ipWhitelist || req.body.auditLogging === false) return fail(res, 'Unsupported security options cannot be enabled. Audit logging is always required.');
  const values = { sessionTimeout, minPasswordLength, requireSpecialChars: boolean(req.body.requireSpecialChars) };
  await persist(req, 'security', values);
  res.json({ success: true, message: 'Security settings applied. Password rules apply to newly set passwords.', settings: values });
};
export const testEmailSettings = async (req, res) => {
  const verified = await emailService.testEmailConfiguration();
  res.status(verified ? 200 : 503).json({ success: verified, message: verified ? 'SMTP connection and authentication verified. Recipient delivery is not confirmed.' : 'SMTP connection could not be verified. Check the configuration and provider.' });
};
