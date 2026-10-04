import { DataTypes } from 'sequelize';
import { sequelize } from './db.js';

export const EmailOutbox = sequelize.define('EmailOutbox', {
  kind: { type: DataTypes.STRING(50), allowNull: false },
  recipient: { type: DataTypes.STRING, allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: false },
  dedupeKey: { type: DataTypes.STRING(160), allowNull: true, unique: true },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  nextAttemptAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  lockedAt: { type: DataTypes.DATE, allowNull: true },
  sentAt: { type: DataTypes.DATE, allowNull: true },
  lastError: { type: DataTypes.STRING(300), allowNull: true }
}, { indexes: [{ fields: ['status', 'nextAttemptAt'] }] });
