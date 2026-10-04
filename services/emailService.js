import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { getRuntimeSettings } from './runtimeSettings.js';
export const escapeEmailHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
export function smtpConfiguration(env = process.env, settings = getRuntimeSettings()) {
  const e = settings.email;
  const host = e.smtpServer || env.EMAIL_HOST || (env.EMAIL_USER ? 'smtp.gmail.com' : '');
  const port = Number(e.smtpServer ? e.smtpPort : (env.EMAIL_PORT || 587));
  const user = e.emailUsername || env.EMAIL_USER;
  const pass = e.emailPassword || env.EMAIL_PASS;
  if (!host || !user || !pass || !Number.isInteger(port) || port < 1 || port > 65535 || /your-email|your-app-password/.test(`${user} ${pass}`)) return null;
  return { host, port, secure: e.smtpServer ? e.emailEncryption === 'ssl' : port === 465,
    requireTLS: e.smtpServer ? e.emailEncryption !== 'ssl' : port !== 465,
    auth: { user, pass: host === 'smtp.gmail.com' ? pass.replace(/\s+/g, '') : pass },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 };
}
export class EmailService {
  constructor({ createTransport = nodemailer.createTransport, env = process.env, settings = getRuntimeSettings } = {}) {
    this.createTransport = createTransport; this.env = env; this.settings = settings;
    this.reconfigure();
  }
  reconfigure() {
    this.transporter?.close?.();
    const config = smtpConfiguration(this.env, this.settings());
    this.transporter = config ? this.createTransport(config) : null;
    this.verified = false;
  }
  getStatus() { return { configured: !!this.transporter, verified: this.verified, mode: this.transporter ? 'smtp' : 'unconfigured' }; }
  async testEmailConfiguration() {
    if (!this.transporter) return false;
    try { await this.transporter.verify(); this.verified = true; return true; }
    catch { this.verified = false; return false; }
  }
  generateVerificationToken() { return crypto.randomBytes(32).toString('hex'); }
  baseUrl() {
    const base = new URL(this.env.BASE_URL || 'http://localhost:3000');
    if (this.env.NODE_ENV === 'production' && base.protocol !== 'https:') throw new Error('Production BASE_URL must use HTTPS');
    return base.origin;
  }
  async send(email, subject, html, category = 'system') {
    const settings = this.settings();
    if (!settings.notifications.emailNotificationsEnabled ||
        (category === 'request' && !settings.notifications.bloodRequestNotifications) ||
        (category === 'registration' && !settings.notifications.registrationNotifications) ||
        (category === 'system' && !settings.notifications.systemAlertNotifications)) return { success: false, suppressed: true, previewUrl: null };
    if (!this.transporter) return { success: false, error: 'SMTP_UNCONFIGURED', previewUrl: null };
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: 'INVALID_RECIPIENT', previewUrl: null };
    try {
      const info = await this.transporter.sendMail({ from: settings.email.fromEmail || this.env.EMAIL_FROM || this.env.EMAIL_USER, to: email, subject, html });
      const accepted = Array.isArray(info.accepted) && info.accepted.length > 0 && !(info.rejected?.length);
      return { success: accepted, error: accepted ? null : 'SMTP_NOT_ACCEPTED', previewUrl: null };
    } catch { return { success: false, error: 'SMTP_SEND_FAILED', previewUrl: null }; }
  }
  async sendVerificationEmail(email, name, token) {
    const url = `${this.baseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
    return this.send(email, 'Verify Your VitalMatch Account', this.getVerificationEmailTemplate(name, url), 'account');
  }
  async sendPasswordResetEmail(email, name, token) {
    const url = `${this.baseUrl()}/reset-password/${encodeURIComponent(token)}`;
    return this.send(email, 'Reset Your VitalMatch Password', this.template(name, 'Reset your password', 'This link expires in one hour. If you did not request it, ignore this message.', url, 'Reset password'), 'account');
  }
  async sendWelcomeEmail(email, name) { return this.send(email, 'Welcome to VitalMatch', this.getWelcomeEmailTemplate(name), 'registration'); }
  async sendNearbyRequestEmail(email, name, request, distanceText) {
    return this.send(email, 'VitalMatch - matching blood request nearby', this.template(name, 'A matching request needs coordination', `${escapeEmailHtml(request.bloodType)} · ${escapeEmailHtml(request.unitsRemaining ?? request.unitsRequired)} units outstanding · ${escapeEmailHtml(distanceText)}<br>${escapeEmailHtml(request.hospitalName)}<br>Sign in to review this request. Staff determine donation eligibility.`, `${this.baseUrl()}/view-blood-request/${request.id}`, 'Review request', true), 'request');
  }
  async sendDonationScheduleEmail(email, name, request, date, notes, url) { return this.send(email, 'VitalMatch - Donation Scheduled', this.getDonationScheduleTemplate(name, request, date, notes, url), 'request'); }
  async sendRequesterScheduleEmail(email, name, request, date, notes, url) { return this.send(email, 'VitalMatch - Your Request is Scheduled', this.getRequesterScheduleTemplate(name, request, date, notes, url), 'request'); }
  async sendRequestUpdateEmail(email, name, request, message) {
    const appointments=request.actionPath==='/my-appointments';
    return this.send(email, 'VitalMatch - Request update', this.template(name, 'Request update', message, appointments ? `${this.baseUrl()}/my-appointments` : `${this.baseUrl()}/view-blood-request/${request.id}`, appointments ? 'Review appointments' : 'Review request'), 'request');
  }
  template(name, heading, message, url, label, safeHtml = false) {
    const parsed = new URL(url, this.baseUrl());
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.origin !== this.baseUrl()) throw new Error('Invalid email action URL');
    return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#202020"><h1>VitalMatch</h1><h2>${escapeEmailHtml(heading)}</h2><p>Hello ${escapeEmailHtml(name)},</p><p>${safeHtml ? message : escapeEmailHtml(message)}</p><p><a href="${escapeEmailHtml(parsed.href)}">${escapeEmailHtml(label)}</a></p><p>This is an automated coordination message. Medical staff determine eligibility and clinical arrangements.</p></body></html>`;
  }
  getVerificationEmailTemplate(name, url) { return this.template(name, 'Verify your account', 'Confirm your email address to activate your account. This link expires in 24 hours.', url, 'Verify email'); }
  getWelcomeEmailTemplate(name) { return this.template(name, 'Your account is active', 'You can submit requests, manage your donor profile and follow your appointments.', `${this.baseUrl()}/dashboard`, 'Open dashboard'); }
  scheduleTemplate(name, request, date, notes, url, role) {
    const message = `Appointment: ${escapeEmailHtml(new Date(date).toLocaleString('en-PH', { timeZone: this.settings().general.timeZone }))}<br>Facility: ${escapeEmailHtml(request.hospitalName)}<br>Blood type: ${escapeEmailHtml(request.bloodType)}<br>Units requested: ${escapeEmailHtml(request.unitsRequired)}<br>${escapeEmailHtml(notes || '')}<br>This is a scheduled appointment; completion has not yet been recorded.`;
    return this.template(name, 'Appointment scheduled', message, url || `${this.baseUrl()}/my-appointments`, 'Review and confirm appointment', true);
  }
  getDonationScheduleTemplate(name, request, date, notes, url) { return this.scheduleTemplate(name, request, date, notes, url, 'donor'); }
  getRequesterScheduleTemplate(name, request, date, notes, url) { return this.scheduleTemplate(name, request, date, notes, url, 'requester'); }
}
export const emailService = new EmailService();
