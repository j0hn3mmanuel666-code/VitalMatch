import { Op } from 'sequelize';
import { sequelize } from '../models/db.js';
import { Notification } from '../models/notificationModel.js';
import { PushOutbox } from '../models/pushOutboxModel.js';
import { PushSubscription } from '../models/pushSubscriptionModel.js';
import { User } from '../models/userModel.js';
import { isPushSchemaReady } from './pushSchemaStatus.js';

const PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_RECEIPT_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_ATTEMPTS = 8;
const retryDelay = attempt => Math.min(6 * 60 * 60 * 1000, 60_000 * 2 ** Math.max(0, attempt - 1));

function requestHeaders() {
  const result = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (process.env.EXPO_ACCESS_TOKEN) result.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  return result;
}

async function expoRequest(url, body) {
  const response = await fetch(url, { method: 'POST', headers: requestHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`EXPO_HTTP_${response.status}`);
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  return payload;
}

async function claimPush() {
  const now = new Date();
  return sequelize.transaction(async transaction => {
    const row = await PushOutbox.findOne({
      where: { [Op.or]: [
        { status: 'pending', nextAttemptAt: { [Op.lte]: now } },
        { status: 'processing', lockedAt: { [Op.lt]: new Date(Date.now() - 5 * 60_000) } }
      ] },
      include: [
        { model: Notification, attributes: ['id', 'userId', 'isRead'] },
        { model: PushSubscription, attributes: ['id', 'userId', 'expoPushToken', 'disabledAt'] }
      ],
      order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE
    });
    if (!row) return null;
    await row.update({ status: 'processing', lockedAt: now, attempts: row.attempts + 1 }, { transaction });
    return row;
  });
}

async function sendOne(row) {
  const subscription = await PushSubscription.findByPk(row.subscriptionId);
  const notification = await Notification.findByPk(row.notificationId);
  const user = subscription && await User.findByPk(subscription.userId, { attributes: ['id', 'isActive', 'archivedAt'] });
  if (!subscription || subscription.disabledAt || !notification || notification.isRead || !user?.isActive || user.archivedAt) {
    await row.update({ status: 'suppressed', lockedAt: null, lastError: null });
    return;
  }

  try {
    const result = await expoRequest(PUSH_SEND_URL, {
      to: subscription.expoPushToken,
      sound: 'default',
      title: 'VitalMatch update',
      body: 'You have a new coordination update. Open VitalMatch to view it.',
      priority: 'high',
      channelId: 'vitalmatch-updates',
      data: { screen: 'updates', notificationId: notification.id }
    });
    const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data;
    if (ticket?.status !== 'ok') {
      const code = ticket?.details?.error || ticket?.message || 'EXPO_PUSH_REJECTED';
      if (code === 'DeviceNotRegistered') {
        await subscription.update({ disabledAt: new Date() });
        await row.update({ status: 'suppressed', lockedAt: null, lastError: code });
        return;
      }
      const retryable = ['MessageRateExceeded', 'TOO_MANY_REQUESTS'].includes(code);
      await row.update({ status: !retryable || row.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', lockedAt: null, lastError: code, nextAttemptAt: new Date(Date.now() + retryDelay(row.attempts)) });
      return;
    }
    await row.update({ status: 'sent', lockedAt: null, sentAt: new Date(), receiptId: ticket.id || null, receiptCheckAfter: ticket.id ? new Date(Date.now() + 15 * 60_000) : null, lastError: null });
  } catch (error) {
    const failed = error.retryable === false || row.attempts >= MAX_ATTEMPTS;
    await row.update({ status: failed ? 'failed' : 'pending', lockedAt: null, lastError: /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'EXPO_NETWORK_ERROR', nextAttemptAt: new Date(Date.now() + retryDelay(row.attempts)) });
  }
}

export async function processPushOutbox({ maximum = 50 } = {}) {
  let processed = 0;
  for (let index = 0; index < maximum; index++) {
    const row = await claimPush();
    if (!row) break;
    await sendOne(row);
    processed++;
  }
  return processed;
}

export async function processPushReceipts({ maximum = 100 } = {}) {
  const rows = await PushOutbox.findAll({
    where: { status: 'sent', receiptId: { [Op.ne]: null }, receiptCheckedAt: null, receiptCheckAfter: { [Op.lte]: new Date() } },
    include: [{ model: PushSubscription, attributes: ['id', 'expoPushToken', 'disabledAt'] }],
    order: [['sentAt', 'ASC']], limit: maximum
  });
  if (!rows.length) return 0;

  let payload;
  try { payload = await expoRequest(PUSH_RECEIPT_URL, { ids: rows.map(row => row.receiptId) }); }
  catch {
    await Promise.all(rows.map(row => row.update({ receiptCheckAfter: new Date(Date.now() + 5 * 60_000) })));
    return 0;
  }
  const receipts = payload?.data || {};
  for (const row of rows) {
    const receipt = receipts[row.receiptId];
    if (!receipt) { await row.update({ receiptCheckAfter: new Date(Date.now() + 10 * 60_000) }); continue; }
    const code = receipt.details?.error || null;
    if (code === 'DeviceNotRegistered') await row.PushSubscription?.update({ disabledAt: new Date() });
    await row.update({ receiptCheckedAt: new Date(), receiptCheckAfter: null, lastError: code || row.lastError });
  }
  return rows.length;
}

export function startPushOutboxWorker() {
  if (!isPushSchemaReady() || process.env.PUSH_OUTBOX_ENABLED === 'false') return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processPushOutbox(); await processPushReceipts(); }
    catch (error) { console.error('Push delivery remains queued for retry:', error?.name || 'Error'); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(tick, 30_000);
  timer.unref();
  return () => clearInterval(timer);
}
