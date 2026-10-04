import { EmailOutbox } from '../models/emailOutboxModel.js';
import { Notification } from '../models/notificationModel.js';

export async function queueNotification(data, { transaction } = {}) {
  if (data.deliveryKey) {
    const [row] = await Notification.findOrCreate({ where: { deliveryKey: data.deliveryKey }, defaults: data, transaction });
    return row;
  }
  return Notification.create(data, { transaction });
}
export async function queueEmail(data, { transaction } = {}) {
  if (!data.recipient) return null;
  if (data.dedupeKey) {
    const [row] = await EmailOutbox.findOrCreate({ where: { dedupeKey: data.dedupeKey }, defaults: data, transaction });
    return row;
  }
  return EmailOutbox.create(data, { transaction });
}
