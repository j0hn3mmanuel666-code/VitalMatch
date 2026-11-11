import { EmailOutbox } from '../models/emailOutboxModel.js';
import { Notification } from '../models/notificationModel.js';
import { PushSubscription } from '../models/pushSubscriptionModel.js';
import { PushOutbox } from '../models/pushOutboxModel.js';
import { isPushSchemaReady } from './pushSchemaStatus.js';

export async function queueNotification(data, { transaction } = {}) {
  let row, created = true;
  if (data.deliveryKey) {
    [row, created] = await Notification.findOrCreate({ where: { deliveryKey: data.deliveryKey }, defaults: data, transaction });
  } else row = await Notification.create(data, { transaction });

  if (created && isPushSchemaReady()) {
    const subscriptions = await PushSubscription.findAll({ where: { userId: data.userId, disabledAt: null }, attributes: ['id'], transaction });
    if (subscriptions.length) await PushOutbox.bulkCreate(subscriptions.map(subscription => ({ notificationId: row.id, subscriptionId: subscription.id })), { transaction, ignoreDuplicates: true });
  }
  return row;
}
export async function queueEmail(data, { transaction } = {}) {
  if (!data.recipient) return null;
  if (data.dedupeKey) {
    const [row] = await EmailOutbox.findOrCreate({ where: { dedupeKey: data.dedupeKey }, defaults: data, transaction });
    return row;
  }
  return EmailOutbox.create(data, { transaction });
}
