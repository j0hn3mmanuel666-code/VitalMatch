import { DataTypes } from 'sequelize';
import { sequelize } from './db.js';
import { BloodRequest } from './bloodRequestModel.js';
import { User } from './userModel.js';

// A coordination invitation survives clearing the notification inbox.
export const RequestAccess = sequelize.define('RequestAccess', {
  requestId: { type: DataTypes.INTEGER, allowNull: false, references: { model: BloodRequest, key: 'id' }, onDelete: 'RESTRICT' },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' }, onDelete: 'RESTRICT' },
  expiresAt: { type: DataTypes.DATE, allowNull: false }
}, { indexes: [{ unique: true, fields: ['requestId', 'userId'] }] });
