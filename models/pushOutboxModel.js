import { DataTypes } from 'sequelize';
import { sequelize } from './db.js';
import { Notification } from './notificationModel.js';
import { PushSubscription } from './pushSubscriptionModel.js';

export const PushOutbox = sequelize.define('PushOutbox', {
  notificationId: { type: DataTypes.INTEGER, allowNull: false, references: { model: Notification, key: 'id' }, onDelete: 'CASCADE' },
  subscriptionId: { type: DataTypes.INTEGER, allowNull: false, references: { model: PushSubscription, key: 'id' }, onDelete: 'CASCADE' },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  nextAttemptAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  lockedAt: { type: DataTypes.DATE, allowNull: true },
  sentAt: { type: DataTypes.DATE, allowNull: true },
  receiptId: { type: DataTypes.STRING(160), allowNull: true },
  receiptCheckAfter: { type: DataTypes.DATE, allowNull: true },
  receiptCheckedAt: { type: DataTypes.DATE, allowNull: true },
  lastError: { type: DataTypes.STRING(300), allowNull: true }
}, {
  indexes: [
    { unique: true, fields: ['notificationId', 'subscriptionId'] },
    { fields: ['status', 'nextAttemptAt'] },
    { fields: ['status', 'receiptCheckAfter'] }
  ]
});

Notification.hasMany(PushOutbox, { foreignKey: 'notificationId', onDelete: 'CASCADE' });
PushOutbox.belongsTo(Notification, { foreignKey: 'notificationId', onDelete: 'CASCADE' });
PushSubscription.hasMany(PushOutbox, { foreignKey: 'subscriptionId', onDelete: 'CASCADE' });
PushOutbox.belongsTo(PushSubscription, { foreignKey: 'subscriptionId', onDelete: 'CASCADE' });
