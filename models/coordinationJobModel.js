import { DataTypes } from 'sequelize';
import { sequelize } from './db.js';

export const CoordinationJob = sequelize.define('CoordinationJob', {
  requestId: { type: DataTypes.INTEGER, allowNull: false },
  mode: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'normal' },
  excludedUserIds: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  dedupeKey: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  nextAttemptAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  lockedAt: { type: DataTypes.DATE, allowNull: true },
  lastError: { type: DataTypes.STRING(300), allowNull: true }
}, { indexes: [{ fields: ['status', 'nextAttemptAt'] }] });
