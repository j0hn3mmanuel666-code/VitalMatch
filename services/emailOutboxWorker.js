import { Op, fn, col } from 'sequelize';
import { sequelize } from '../models/db.js';
import { EmailOutbox } from '../models/emailOutboxModel.js';
import { Appointment } from '../models/appointmentModel.js';
import { User } from '../models/userModel.js';
import { UserSetting } from '../models/userSettingModel.js';
import { emailService } from './emailService.js';
import { dispatchCoordinationJobs } from './coordinationJobService.js';
import { BloodRequest } from '../models/bloodRequestModel.js';
import { Donor } from '../models/donorModel.js';
import { isDonorReady } from './coordinationPolicy.js';
import { isCompatible } from '../models/pledgeModel.js';

export function retryDelay(attempt) { return Math.min(6 * 3600000, 60000 * 2 ** Math.max(0, attempt - 1)); }
export async function dispatchEmailRow(row, service = emailService) {
  const p = row.payload;
  if (row.kind === 'nearby-request') return service.sendNearbyRequestEmail(row.recipient, p.recipientName, p.request, p.distanceText);
  if (row.kind === 'donor-schedule') return service.sendDonationScheduleEmail(row.recipient, p.recipientName, p.request, p.scheduledDate, p.notes, p.confirmUrl);
  if (row.kind === 'requester-schedule') return service.sendRequesterScheduleEmail(row.recipient, p.recipientName, p.request, p.scheduledDate, p.notes, p.confirmUrl);
  if (row.kind === 'request-update') return service.sendRequestUpdateEmail(row.recipient, p.recipientName, p.request || { id: p.requestId }, p.message);
  return { success: false, error: 'UNSUPPORTED_EMAIL_KIND' };
}
export async function processEmailOutbox({ service = emailService, maximum = 20 } = {}) {
  let processed = 0;
  for (let i = 0; i < maximum; i++) {
    const now = new Date();
    const row = await sequelize.transaction(async transaction => {
      const candidate = await EmailOutbox.findOne({ where: { [Op.or]: [
        { status: 'pending', nextAttemptAt: { [Op.lte]: now } },
        { status: 'processing', lockedAt: { [Op.lt]: new Date(Date.now() - 5 * 60000) } }
      ] }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
      if (!candidate) return null;
      await candidate.update({ status: 'processing', lockedAt: now, attempts: candidate.attempts + 1 }, { transaction });
      return candidate;
    });
    if (!row) break;
    const user = await User.findOne({ where: { email: row.recipient, isActive: true, emailVerified: true, archivedAt: null } });
    const prefs = user && await UserSetting.findOne({ where: { userId: user.id } });
    let result;
    if (!user || (prefs && !prefs.emailUpdates)) result = { suppressed: true };
    if (!result && row.kind === 'nearby-request') {
      const request = await BloodRequest.findByPk(row.payload.request?.id);
      const donor = await Donor.findOne({where:{userId:user.id}});
      const occupied = donor && await Appointment.count({where:{donorId:donor.id,status:'scheduled',scheduledDate:{[Op.gte]:new Date()}}});
      if (!request || request.status !== 'active' || request.hospitalStatus !== 'approved' || request.archivedAt || request.version !== row.payload.request?.version || !isDonorReady(donor) || !isCompatible(donor.bloodType,request.bloodType) || occupied) result = { superseded:true };
    }
    if (!result && row.payload.appointmentId) {
      const appointment = await Appointment.findByPk(row.payload.appointmentId);
      if (!appointment || appointment.status !== 'scheduled' || appointment.version !== row.payload.appointmentVersion) result = { superseded: true };
    }
    if (!result) {
      try { result = await dispatchEmailRow(row, service); }
      catch { result = { success: false, error: 'EMAIL_TEMPLATE_FAILED' }; }
    }
    const status = result.success ? 'sent' : result.superseded ? 'superseded' : result.suppressed ? 'suppressed' : row.attempts >= 8 ? 'failed' : 'pending';
    await row.update({ status, lockedAt: null, sentAt: result.success ? new Date() : null,
      lastError: result.success || result.superseded || result.suppressed ? null : result.error || 'SMTP_SEND_FAILED',
      nextAttemptAt: new Date(Date.now() + retryDelay(row.attempts)) });
    processed++;
  }
  return processed;
}
export async function emailOutboxSummary() {
  const groups = await EmailOutbox.findAll({ attributes: ['status', [fn('COUNT', col('id')), 'count']], group: ['status'], raw: true });
  return Object.fromEntries(groups.map(g => [g.status, Number(g.count)]));
}
export function startEmailOutboxWorker() {
  if (process.env.EMAIL_OUTBOX_ENABLED === 'false') return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (process.env.COORDINATION_JOBS_ENABLED !== 'false') await dispatchCoordinationJobs();
      await processEmailOutbox();
    } catch { console.error('Coordination/email processing failed; pending records remain for retry.'); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 30000); timer.unref();
  return () => clearInterval(timer);
}
