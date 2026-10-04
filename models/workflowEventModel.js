import { DataTypes } from 'sequelize';
import { sequelize } from './db.js';
import { BloodRequest } from './bloodRequestModel.js';

export const WorkflowEvent = sequelize.define('WorkflowEvent', {
  requestId: { type: DataTypes.INTEGER, allowNull: false, references: { model: BloodRequest, key: 'id' }, onDelete: 'RESTRICT' },
  actorId: { type: DataTypes.INTEGER, allowNull: true },
  action: { type: DataTypes.STRING(60), allowNull: false },
  reason: { type: DataTypes.TEXT, allowNull: true },
  details: { type: DataTypes.JSON, allowNull: true },
  operationKey: { type: DataTypes.STRING(100), allowNull: true, unique: true }
}, { updatedAt: false, indexes: [{ fields: ['requestId', 'createdAt'] }] });

export const Fulfillment = sequelize.define('Fulfillment', {
  requestId: { type: DataTypes.INTEGER, allowNull: false, references: { model: BloodRequest, key: 'id' }, onDelete: 'RESTRICT' },
  appointmentId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Appointments', key: 'id' }, onDelete: 'RESTRICT' },
  donorId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Donors', key: 'id' }, onDelete: 'RESTRICT' },
  donorName: { type: DataTypes.STRING, allowNull: true },
  actorId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'RESTRICT' },
  unitsProvided: { type: DataTypes.INTEGER, allowNull: false },
  fulfilledAt: { type: DataTypes.DATE, allowNull: false },
  notes: { type: DataTypes.TEXT, allowNull: false },
  operationKey: { type: DataTypes.STRING(100), allowNull: true, unique: true }
}, { updatedAt: false, indexes: [{ fields: ['requestId', 'fulfilledAt'] }, { fields: ['donorId', 'fulfilledAt'] }] });

// Enables scoped history search without loading or truncating the donation set.
Fulfillment.belongsTo(BloodRequest, { foreignKey: 'requestId' });
